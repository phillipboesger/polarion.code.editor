package biz.avasis.polarion.copilot.config;

import java.util.Map;

/**
 * Configuration DTO for an LLM call.
 * <p>
 * This class represents the contract for configuring large language model interactions.
 * It is typically populated from JSON configuration files (e.g., loaded from the
 * <code>.avasis/avaCopilot/</code> directory) and provides parameters such as
 * the provider, model, API endpoints, prompts, and authentication details needed
 * to execute a request.
 * </p>
 */
public class LlmRequestConfig {

	private String providerId; // e.g. "openai", "azure-openai", "ollama"
	private String baseUrl; // e.g. "https://api.openai.com/v1/chat/completions"
	private String model; // e.g. "gpt-4o-mini"
	private String apiKey; // Directly the API key or a Vault reference
	private String systemPrompt; // System prompt from JSON
	private String userPrompt; // User prompt template from JSON with placeholders
	private Integer maxOutputTokens; // Optional limitation of response length (e.g. for Claude)
	private Map<String, String> providerHeaders; // Optional additional/overriding HTTP headers

	public String getProviderId() {
		return providerId;
	}

	/**
	 * Sets the provider ID (e.g. "openai").
	 *
	 * @param providerId the provider identifier
	 */
	public void setProviderId(String providerId) {
		this.providerId = providerId;
	}

	public String getBaseUrl() {
		return baseUrl;
	}

	/**
	 * Sets the base URL for the LLM API.
	 *
	 * @param baseUrl the API endpoint URL
	 */
	public void setBaseUrl(String baseUrl) {
		this.baseUrl = baseUrl;
	}

	public String getModel() {
		return model;
	}

	/**
	 * Sets the model name to be used.
	 *
	 * @param model the model identifier
	 */
	public void setModel(String model) {
		this.model = model;
	}

	public String getApiKey() {
		return apiKey;
	}

	/**
	 * Sets the API key or vault key reference.
	 *
	 * @param apiKey the API key string
	 */
	public void setApiKey(String apiKey) {
		this.apiKey = apiKey;
	}

	public String getSystemPrompt() {
		return systemPrompt;
	}

	/**
	 * Sets the system prompt to be sent to the LLM.
	 *
	 * @param systemPrompt the system prompt text
	 */
	public void setSystemPrompt(String systemPrompt) {
		this.systemPrompt = systemPrompt;
	}

	public String getUserPrompt() {
		return userPrompt;
	}

	/**
	 * Sets the user prompt template. Use placeholders like ${currentContent}.
	 *
	 * @param userPrompt the user prompt template
	 */
	public void setUserPrompt(String userPrompt) {
		this.userPrompt = userPrompt;
	}

	public Integer getMaxOutputTokens() {
		return maxOutputTokens;
	}

	/**
	 * Sets the maximum number of tokens to generate.
	 *
	 * @param maxOutputTokens the max token count
	 */
	public void setMaxOutputTokens(Integer maxOutputTokens) {
		this.maxOutputTokens = maxOutputTokens;
	}

	public Map<String, String> getProviderHeaders() {
		return providerHeaders;
	}

	/**
	 * Sets additional provider-specific HTTP headers.
	 *
	 * @param providerHeaders a map of header names and values
	 */
	public void setProviderHeaders(Map<String, String> providerHeaders) {
		this.providerHeaders = providerHeaders;
	}
}
