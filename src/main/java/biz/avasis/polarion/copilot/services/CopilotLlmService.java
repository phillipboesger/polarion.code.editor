package biz.avasis.polarion.copilot.services;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import com.polarion.platform.internal.security.UserAccountVault;

import biz.avasis.polarion.copilot.config.LlmRequestConfig;
import biz.avasis.polarion.core.logger.AvaLogger;
import biz.avasis.polarion.core.logger.AvaLogger.Level;

/**
 * Service for calls to a configurable LLM (e.g. ChatGPT).
 * <p>
 * This class only knows generic HTTP parameters (Base URL, Model, API Key Env Var,
 * System Prompt, User Prompt Template) and is therefore independent of the concrete provider.
 * The actual configuration can later be loaded e.g. from a JSON file in .avasis
 * and mapped to an {@link LlmRequestConfig}.
 * </p>
 */
public class CopilotLlmService {

	private static final AvaLogger log = new AvaLogger(CopilotLlmService.class);

	private enum ProviderKind {
		OPENAI,
		AZURE,
		ANTHROPIC,
		GEMINI
	}

	private static final String[] OPENAI_IDS = { "openai", "openai-compatible" };
	private static final String[] AZURE_IDS = { "azure-openai", "azure-gpt", "azure" };
	private static final String[] ANTHROPIC_IDS = { "claude", "anthropic" };
	private static final String[] GEMINI_IDS = { "gemini", "google-gemini" };

	private static final Map<String, ProviderKind> PROVIDER_KIND_BY_ID = new HashMap<>();
	private static final String ANTHROPIC_API_VERSION_DEFAULT = "2023-06-01";

	private static final String HEADER_AUTHORIZATION = "Authorization";
	private static final String JSON_ROLE = "role";
	private static final String JSON_CONTENT = "content";
	private static final String JSON_USER = "user";
	private static final String JSON_SYSTEM = "system";
	private static final String JSON_TEXT = "text";
	private static final String JSON_MODEL = "model";

	static {
		registerProviderIds(ProviderKind.OPENAI, OPENAI_IDS);
		registerProviderIds(ProviderKind.AZURE, AZURE_IDS);
		registerProviderIds(ProviderKind.ANTHROPIC, ANTHROPIC_IDS);
		registerProviderIds(ProviderKind.GEMINI, GEMINI_IDS);
	}

	/**
	 * Executes an LLM call where two text states (current and previous) are sent to the LLM together with
	 * a system and a user prompt.
	 *
	 * @param  config          configurable LLM settings and prompts
	 * @param  currentContent  current document content (e.g. $currentContent)
	 * @param  previousContent previous document content (e.g. $previousContent)
	 * @return                 LLM response as raw string (provider-specific JSON) or
	 *                         {@code null} on errors
	 */
	public String invokeLlm(LlmRequestConfig config, String currentContent, String previousContent) {
		if(config == null) {
			log.log("invokeLlm: config is null, abort", Level.ERROR);
			return "Error: Configuration is missing.";
		}

		ProviderKind providerKind = resolveProviderKind(config.getProviderId());
		logDebugInfo(config, providerKind, currentContent, previousContent);

		String apiKey = resolveApiKey(config);
		if(apiKey == null || apiKey.isEmpty()) {
			log.log("invokeLlm: no API key resolved, skipping HTTP call", Level.WARNING);
			return "Error: API Key is missing or empty.";
		}

		String requestBody = buildRequestBody(providerKind, config, currentContent, previousContent);
		if(requestBody == null) {
			log.log("invokeLlm: request body could not be built (null)", Level.ERROR);
			return "Error: Failed to build request body.";
		}

		return executeRequest(config, providerKind, apiKey, requestBody);
	}

	/**
	 * Logs debug information about the request parameters and content length.
	 *
	 * @param config          the LLM request configuration
	 * @param providerKind    the resolved provider kind
	 * @param currentContent  the current content string
	 * @param previousContent the previous content string
	 */
	private void logDebugInfo(LlmRequestConfig config, ProviderKind providerKind, String currentContent, String previousContent) {
		log.log(
				"invokeLlm: provider=" + safe(providerKind != null ? providerKind.name() : "null") +
						", baseUrl=" + safe(config.getBaseUrl()) +
						", model=" + safe(config.getModel()),
				Level.DEBUG);

		log.log(
				"invokeLlm: currentContent.length=" + (currentContent != null ? currentContent.length() : 0) +
						", previousContent.length=" + (previousContent != null ? previousContent.length() : 0),
				Level.DEBUG);
	}

	/**
	 * Executes the actual HTTP request to the LLM provider.
	 *
	 * @param  config       the LLM request configuration
	 * @param  providerKind the provider kind
	 * @param  apiKey       the resolved API key
	 * @param  requestBody  the JSON request body
	 * @return              the response body or an error message
	 */
	private String executeRequest(LlmRequestConfig config, ProviderKind providerKind, String apiKey, String requestBody) {
		log.log("invokeLlm: request body built, length=" + requestBody.length(), Level.DEBUG);

		HttpURLConnection connection = null;
		try {
			connection = createConnection(config, providerKind, apiKey);
			sendRequest(connection, requestBody);
			return readResponse(connection, providerKind);
		}
		catch(IOException e) {
			log.log("invokeLlm: IOException during LLM call: " + safe(e.getMessage()), Level.ERROR);
			return "Error: Connection failed. " + e.getMessage();
		}
		finally {
			if(connection != null) {
				connection.disconnect();
			}
		}
	}

	/**
	 * Creates and configures the HTTP connection.
	 *
	 * @param  config       the LLM request configuration
	 * @param  providerKind the provider kind
	 * @param  apiKey       the API key
	 * @return              configured HttpURLConnection
	 * @throws IOException  if the connection cannot be opened
	 */
	private HttpURLConnection createConnection(LlmRequestConfig config, ProviderKind providerKind, String apiKey) throws IOException {
		URI uri = URI.create(config.getBaseUrl());
		URL url = uri.toURL();
		log.log("invokeLlm: opening HTTP connection to " + safe(config.getBaseUrl()), Level.DEBUG);
		HttpURLConnection connection = (HttpURLConnection) url.openConnection();
		connection.setRequestMethod("POST");
		connection.setDoOutput(true);
		applyAuthHeaders(connection, providerKind, apiKey, config);
		connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
		return connection;
	}

	/**
	 * Sends the request body to the output stream of the connection.
	 *
	 * @param  connection  the HTTP connection
	 * @param  requestBody the body string to send
	 * @throws IOException if writing to the stream fails
	 */
	private void sendRequest(HttpURLConnection connection, String requestBody) throws IOException {
		byte[] bodyBytes = requestBody.getBytes(StandardCharsets.UTF_8);
		connection.setRequestProperty("Content-Length", String.valueOf(bodyBytes.length));
		try(OutputStream os = connection.getOutputStream()) {
			os.write(bodyBytes);
		}
	}

	/**
	 * Reads the response from the connection and handles potential errors.
	 *
	 * @param  connection   the HTTP connection
	 * @param  providerKind the provider kind (used for extraction strategy)
	 * @return              the response string (extracted content or raw body)
	 * @throws IOException  if reading from the stream fails
	 */
	private String readResponse(HttpURLConnection connection, ProviderKind providerKind) throws IOException {
		int status = connection.getResponseCode();
		log.log("invokeLlm: HTTP response status=" + status, Level.INFO);

		InputStream is = status >= 200 && status < 300
				? connection.getInputStream()
				: connection.getErrorStream();

		if(is == null) {
			log.log("invokeLlm: HTTP response InputStream is null", Level.ERROR);
			return "Error: No response from server (InputStream is null).";
		}

		try(BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
			StringBuilder response = new StringBuilder();
			String line;
			while((line = reader.readLine()) != null) {
				response.append(line).append('\n');
			}
			String body = response.toString().trim();
			log.log("invokeLlm: HTTP response body length=" + body.length(), Level.DEBUG);

			if(status < 200 || status >= 300) {
				String snippet = body.length() > 500 ? body.substring(0, 500) + "..." : body;
				log.log("invokeLlm: non-success status=" + status + ", body snippet=" + snippet, Level.WARNING);
				return "Error: HTTP " + status + " - " + body;
			}

			String extracted = extractAssistantContent(providerKind, body);
			if(extracted != null && !extracted.isBlank()) {
				log.log("invokeLlm: extracted assistant content, length=" + extracted.length(), Level.INFO);
				return extracted.trim();
			}
			return body;
		}
	}

	/**
	 * Registers a set of provider IDs for a specific provider kind.
	 *
	 * @param kind the provider kind
	 * @param ids  array of provider identifier strings
	 */
	private static void registerProviderIds(ProviderKind kind, String[] ids) {
		if(ids == null) { return; }
		Arrays.stream(ids)
				.filter(id -> id != null && !id.isBlank())
				.forEach(id -> PROVIDER_KIND_BY_ID.put(id.trim().toLowerCase(), kind));
	}

	/**
	 * Resolves the provider kind from a string identifier.
	 * <p>
	 * Defaults to {@link ProviderKind#OPENAI} if the ID is unknown or null.
	 * </p>
	 *
	 * @param  providerId the provider identifier (e.g. "azure")
	 * @return            the corresponding {@link ProviderKind}
	 */
	private ProviderKind resolveProviderKind(String providerId) {
		if(providerId == null || providerId.isBlank()) { return ProviderKind.OPENAI; }
		ProviderKind kind = PROVIDER_KIND_BY_ID.get(providerId.trim().toLowerCase());
		return kind != null ? kind : ProviderKind.OPENAI;
	}

	/**
	 * Applies authentication and custom headers to the connection.
	 *
	 * @param connection the HTTP connection
	 * @param kind       the provider kind
	 * @param apiKey     the API key
	 * @param config     the configuration containing extra headers
	 */
	private void applyAuthHeaders(HttpURLConnection connection, ProviderKind kind, String apiKey, LlmRequestConfig config) {
		ProviderKind effective = kind == null ? ProviderKind.OPENAI : kind;
		Map<String, String> headers = new HashMap<>();

		setProviderSpecificHeaders(headers, effective, apiKey);
		addConfiguredHeaders(headers, config);

		for(Map.Entry<String, String> header : headers.entrySet()) {
			connection.setRequestProperty(header.getKey(), header.getValue());
		}
	}

	/**
	 * Sets headers specific to the provider kind (e.g. "api-key" for Azure).
	 *
	 * @param headers the map to populate
	 * @param kind    the provider kind
	 * @param apiKey  the API key
	 */
	private void setProviderSpecificHeaders(Map<String, String> headers, ProviderKind kind, String apiKey) {
		switch (kind) {
			case AZURE:
				headers.put("api-key", apiKey);
				break;
			case ANTHROPIC:
				headers.put("x-api-key", apiKey);
				headers.put("anthropic-version", ANTHROPIC_API_VERSION_DEFAULT);
				break;
			case GEMINI:
				headers.put("x-goog-api-key", apiKey);
				break;
			case OPENAI:
			default:
				headers.put(HEADER_AUTHORIZATION, "Bearer " + apiKey);
		}
	}

	/**
	 * Adds user-configured extra headers from the configuration.
	 *
	 * @param headers the map to populate
	 * @param config  the configuration
	 */
	private void addConfiguredHeaders(Map<String, String> headers, LlmRequestConfig config) {
		if(config != null && config.getProviderHeaders() != null) {
			config.getProviderHeaders().forEach((key, value) -> {
				if(isValidHeader(key, value)) {
					headers.put(key.trim(), value);
				}
			});
		}
	}

	/**
	 * Checks if a header key/value pair is valid.
	 *
	 * @param  key   header name
	 * @param  value header value
	 * @return       {@code true} if valid, {@code false} otherwise
	 */
	private boolean isValidHeader(String key, String value) {
		return key != null && !key.isBlank() && value != null;
	}

	/**
	 * Resolves the API key, either directly from config or via the Polarion Vault.
	 *
	 * @param  config the configuration
	 * @return        the resolved API key string or configured value
	 */
	private String resolveApiKey(LlmRequestConfig config) {
		String configured = config.getApiKey();
		if(configured == null || configured.isBlank()) {
			log.log("resolveApiKey: no API key configured", Level.WARNING);
			return null;
		}

		configured = configured.trim();

		// Try to resolve from Polarion User Account Vault
		try {
			UserAccountVault.Credentials credentials = UserAccountVault.getInstance().tryGetCredentialsForKey(configured);
			if(credentials != null) {
				log.log("resolveApiKey: found API key in vault for key: " + configured, Level.DEBUG);
				return credentials.getPassword();
			}
		}
		catch(Exception e) {
			log.log("resolveApiKey: Vault lookup exception (ignoring): " + e.getMessage(), Level.DEBUG);
		}

		log.log("resolveApiKey: using configured API token directly", Level.DEBUG);
		return configured;
	}

	/**
	 * Builds the JSON request body depending on the provider.
	 *
	 * @param  providerKind    the provider kind
	 * @param  config          the configuration
	 * @param  currentContent  current document content
	 * @param  previousContent previous document content
	 * @return                 JSON string body
	 */
	private String buildRequestBody(ProviderKind providerKind, LlmRequestConfig config, String currentContent, String previousContent) {
		String systemPrompt = orEmpty(config.getSystemPrompt());
		String userTemplate = orEmpty(config.getUserPrompt());

		// Very simple template logic: replace placeholders in user prompt
		String userPrompt = userTemplate
				.replace("${currentContent}", currentContent)
				.replace("${previousContent}", previousContent);

		ProviderKind kind = providerKind == null ? ProviderKind.OPENAI : providerKind;

		switch (kind) {
			case ANTHROPIC:
				return buildAnthropicRequestBody(config, systemPrompt, userPrompt);
			case GEMINI:
				return buildGeminiRequestBody(systemPrompt, userPrompt);
			case AZURE, OPENAI:
			default:
				// Default: OpenAI/Azure-compatible chat completions request
				return buildOpenAiStyleRequestBody(config, systemPrompt, userPrompt);
		}
	}

	/**
	 * Builds a request body for OpenAI-compatible APIs (including Azure).
	 *
	 * @param  config       the configuration
	 * @param  systemPrompt the system prompt
	 * @param  userPrompt   the user prompt
	 * @return              JSON string
	 */
	private String buildOpenAiStyleRequestBody(LlmRequestConfig config, String systemPrompt, String userPrompt) {
		Map<String, Object> payload = new HashMap<>();
		payload.put(JSON_MODEL, orEmpty(config.getModel()));

		List<Map<String, String>> messages = new ArrayList<>();
		Map<String, String> systemMsg = new HashMap<>();
		systemMsg.put(JSON_ROLE, JSON_SYSTEM);
		systemMsg.put(JSON_CONTENT, systemPrompt);
		messages.add(systemMsg);

		Map<String, String> userMsg = new HashMap<>();
		userMsg.put(JSON_ROLE, JSON_USER);
		userMsg.put(JSON_CONTENT, userPrompt);
		messages.add(userMsg);

		payload.put("messages", messages);

		Gson gson = new Gson();
		return gson.toJson(payload);
	}

	/**
	 * Builds a request body for Anthropic (Claude) API.
	 *
	 * @param  config       the configuration
	 * @param  systemPrompt the system prompt
	 * @param  userPrompt   the user prompt
	 * @return              JSON string
	 */
	private String buildAnthropicRequestBody(LlmRequestConfig config, String systemPrompt, String userPrompt) {
		Map<String, Object> payload = new HashMap<>();
		payload.put(JSON_MODEL, orEmpty(config.getModel()));

		Integer maxOutputTokens = config.getMaxOutputTokens();
		int maxTokens = maxOutputTokens != null ? maxOutputTokens : 1024;
		payload.put("max_tokens", maxTokens);
		if(!systemPrompt.isEmpty()) {
			payload.put(JSON_SYSTEM, systemPrompt);
		}

		// Anthropic messages-API: messages[ { role: "user", content: [ { type: "text", text: "..." } ] } ]
		List<Map<String, Object>> messages = new ArrayList<>();
		Map<String, Object> userMsg = new HashMap<>();
		userMsg.put(JSON_ROLE, JSON_USER);

		List<Map<String, String>> content = new ArrayList<>();
		Map<String, String> textPart = new HashMap<>();
		textPart.put("type", JSON_TEXT);
		textPart.put(JSON_TEXT, userPrompt);
		content.add(textPart);

		userMsg.put(JSON_CONTENT, content);
		messages.add(userMsg);

		payload.put("messages", messages);

		Gson gson = new Gson();
		return gson.toJson(payload);
	}

	/**
	 * Builds a request body for Google Gemini API.
	 *
	 * @param  systemPrompt the system prompt (prepended to user prompt)
	 * @param  userPrompt   the user prompt
	 * @return              JSON string
	 */
	private String buildGeminiRequestBody(String systemPrompt, String userPrompt) {
		StringBuilder combined = new StringBuilder();
		if(!systemPrompt.isEmpty()) {
			combined.append(systemPrompt).append("\n\n");
		}
		combined.append(userPrompt);

		Map<String, Object> payload = new HashMap<>();

		List<Map<String, Object>> contents = new ArrayList<>();
		Map<String, Object> content = new HashMap<>();

		List<Map<String, String>> parts = new ArrayList<>();
		Map<String, String> part = new HashMap<>();
		part.put(JSON_TEXT, combined.toString());
		parts.add(part);

		content.put("parts", parts);
		contents.add(content);

		payload.put("contents", contents);

		Gson gson = new Gson();
		return gson.toJson(payload);
	}

	/**
	 * Helper to return empty string if value is null.
	 *
	 * @param  value input string
	 * @return       input or empty string
	 */
	private String orEmpty(String value) {
		return value == null ? "" : value;
	}

	/**
	 * Helper to return "null" string if value is null.
	 *
	 * @param  value input string
	 * @return       input or "null"
	 */
	private String safe(String value) {
		return value == null ? "null" : value;
	}

	/**
	 * Extracts the relevant assistant text content from the provider response body.
	 *
	 * @param  providerKind the provider kind
	 * @param  body         the raw JSON response body
	 * @return              extracted text content or null if parsing fails/not found
	 */
	private String extractAssistantContent(ProviderKind providerKind, String body) {
		try {
			JsonElement root = JsonParser.parseString(body);
			if(!root.isJsonObject()) { return null; }

			JsonObject obj = root.getAsJsonObject();

			ProviderKind kind = providerKind == null ? ProviderKind.OPENAI : providerKind;

			if(kind == ProviderKind.ANTHROPIC) { return extractAnthropicContent(obj); }

			if(kind == ProviderKind.GEMINI) { return extractGeminiContent(obj); }

			// Default: OpenAI/Azure-compatible chat completions structure
			return extractOpenAiContent(obj);
		}
		catch(JsonSyntaxException ex) {
			log.log("invokeLlm: failed to parse LLM response JSON, returning raw body. Error=" + safe(ex.getMessage()), Level.ERROR);
		}

		return null;
	}

	/**
	 * Extracts content from Anthropic JSON response.
	 *
	 * @param  obj the root JSON object
	 * @return     extracted text
	 */
	private String extractAnthropicContent(JsonObject obj) {
		// Anthropic Claude: content[0].text
		JsonArray contentArr = obj.getAsJsonArray(JSON_CONTENT);
		if(contentArr == null || contentArr.isEmpty()) { return null; }

		JsonElement first = contentArr.get(0);
		if(!first.isJsonObject()) { return null; }

		JsonObject firstObj = first.getAsJsonObject();
		JsonElement textEl = firstObj.get(JSON_TEXT);
		if(textEl == null || textEl.isJsonNull()) { return null; }
		return textEl.getAsString();
	}

	/**
	 * Extracts content from Google Gemini JSON response.
	 *
	 * @param  obj the root JSON object
	 * @return     extracted text
	 */
	private String extractGeminiContent(JsonObject obj) {
		// Google Gemini: candidates[0].content.parts[0].text
		JsonArray candidates = obj.getAsJsonArray("candidates");
		if(candidates == null || candidates.isEmpty()) { return null; }

		JsonObject firstCand = candidates.get(0).getAsJsonObject();
		JsonObject contentObj = firstCand.getAsJsonObject(JSON_CONTENT);
		if(contentObj == null) { return null; }

		JsonArray parts = contentObj.getAsJsonArray("parts");
		if(parts == null || parts.isEmpty()) { return null; }

		JsonObject firstPart = parts.get(0).getAsJsonObject();
		JsonElement textEl = firstPart.get(JSON_TEXT);
		if(textEl == null || textEl.isJsonNull()) { return null; }
		return textEl.getAsString();
	}

	/**
	 * Extracts content from OpenAI/Azure JSON response.
	 *
	 * @param  obj the root JSON object
	 * @return     extracted text
	 */
	private String extractOpenAiContent(JsonObject obj) {
		JsonArray choices = obj.getAsJsonArray("choices");
		if(choices == null || choices.isEmpty()) { return null; }

		JsonObject first = choices.get(0).getAsJsonObject();
		JsonObject message = first.getAsJsonObject("message");
		if(message == null) { return null; }

		JsonElement contentEl = message.get(JSON_CONTENT);
		if(contentEl == null || contentEl.isJsonNull()) { return null; }
		return contentEl.getAsString();
	}
}
