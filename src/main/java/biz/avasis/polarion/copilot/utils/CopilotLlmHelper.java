package biz.avasis.polarion.copilot.utils;

import java.io.IOException;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import biz.avasis.polarion.copilot.config.LlmRequestConfig;
import biz.avasis.polarion.copilot.services.CopilotLlmService;
import biz.avasis.polarion.core.fileeditor.FileEditorService;

public class CopilotLlmHelper {

	public static final String DEFAULT_LLM_CONFIG_FILE = "avaCopilot/llm-config.json";

	/**
	 * Determines the effective LLM configuration for a specific
	 * Copilot JSON configuration.
	 * <p>
	 * Resolution order:
	 * </p>
	 * <ol>
	 * <li>Global or project-specific <code>avaCopilot/llm-config.json</code>
	 * (base configuration).</li>
	 * <li>Specific <code>llmConfig</code> section within the passed
	 * JSON configuration file (e.g. "avaCopilot/documentCompare.json").</li>
	 * </ol>
	 * <p>
	 * Values from the specific configuration override the global
	 * base configuration, if set.
	 * </p>
	 *
	 * @param  projectId      the project ID or {@code null} for global
	 * @param  mainConfigFile JSON file within <code>.avasis</code>,
	 *                          e.g. "avaCopilot/documentCompare.json"
	 * @return                merged {@link LlmRequestConfig}
	 *                        or {@code null} if nothing is found
	 */
	public LlmRequestConfig resolveLlmConfig(String projectId, String mainConfigFile) {
		LlmRequestConfig baseConfig = loadLlmConfigFromFile(projectId, DEFAULT_LLM_CONFIG_FILE);
		LlmRequestConfig specificConfig = loadEmbeddedLlmConfig(projectId, mainConfigFile);

		if(baseConfig == null && specificConfig == null) { return null; }
		if(baseConfig == null) { return specificConfig; }
		if(specificConfig == null) { return baseConfig; }
		return mergeLlmConfigs(baseConfig, specificConfig);
	}

	/**
	 * Entry point for Velocity to execute an LLM call with two text states
	 * (current and previous content).
	 * <p>
	 * The actual configuration (provider, base URL, model, prompts, etc.)
	 * is passed via {@link LlmRequestConfig} and can
	 * later be loaded e.g. from a JSON file in .avasis.
	 * </p>
	 *
	 * @param  config          LLM configuration incl. prompts
	 * @param  currentContent  current content
	 * @param  previousContent previous content
	 * @return                 LLM response as raw string or {@code null}
	 */
	public String invokeLlmWithContents(LlmRequestConfig config, String currentContent, String previousContent) {
		CopilotLlmService service = new CopilotLlmService();
		return service.invokeLlm(config, currentContent, previousContent);
	}

	/**
	 * Loads the LLM configuration from a standalone JSON file in the repository.
	 *
	 * @param  projectId the project ID
	 * @param  fileName  the file path relative to the .avasis folder
	 * @return           parsed LlmRequestConfig or null
	 */
	public LlmRequestConfig loadLlmConfigFromFile(String projectId, String fileName) {
		try {
			String json = FileEditorService.loadFileContent(projectId, fileName, null);
			if(json == null || json.isBlank()) { return null; }
			Gson gson = new Gson();
			return gson.fromJson(json, LlmRequestConfig.class);
		}
		catch(IllegalArgumentException | IOException e) {
			return null;
		}
	}

	/**
	 * Loads the LLM configuration embedded in another JSON config file (e.g. documentCompare.json).
	 * <p>
	 * Looks for an "llmConfig" object property.
	 * </p>
	 *
	 * @param  projectId      the project ID
	 * @param  mainConfigFile the main configuration file
	 * @return                parsed LlmRequestConfig or null
	 */
	public LlmRequestConfig loadEmbeddedLlmConfig(String projectId, String mainConfigFile) {
		try {
			String json = FileEditorService.loadFileContent(projectId, mainConfigFile, null);
			if(json == null || json.isBlank()) { return null; }
			JsonElement root = JsonParser.parseString(json);
			if(!root.isJsonObject()) { return null; }
			JsonObject obj = root.getAsJsonObject();
			JsonElement llmElement = obj.get("llmConfig");
			if(llmElement == null || !llmElement.isJsonObject()) { return null; }
			Gson gson = new Gson();
			return gson.fromJson(llmElement, LlmRequestConfig.class);
		}
		catch(IllegalArgumentException | IOException e) {
			return null;
		}
	}

	/**
	 * Merges two LLM configurations.
	 * <p>
	 * The specific configuration takes precedence over the base configuration.
	 * </p>
	 *
	 * @param  base     the base configuration (global/default)
	 * @param  specific the specific configuration (local/override)
	 * @return          merged configuration object
	 */
	private LlmRequestConfig mergeLlmConfigs(LlmRequestConfig base, LlmRequestConfig specific) {
		LlmRequestConfig result = new LlmRequestConfig();

		result.setProviderId(firstNonBlank(specific.getProviderId(), base.getProviderId()));
		result.setBaseUrl(firstNonBlank(specific.getBaseUrl(), base.getBaseUrl()));
		result.setModel(firstNonBlank(specific.getModel(), base.getModel()));
		result.setApiKey(firstNonBlank(specific.getApiKey(), base.getApiKey()));
		result.setSystemPrompt(firstNonBlank(specific.getSystemPrompt(), base.getSystemPrompt()));
		result.setUserPrompt(firstNonBlank(specific.getUserPrompt(), base.getUserPrompt()));

		return result;
	}

	/**
	 * Returns the first non-blank string from the arguments.
	 *
	 * @param  primary  the preferred string
	 * @param  fallback the fallback string
	 * @return          primary if not blank, otherwise fallback
	 */
	private String firstNonBlank(String primary, String fallback) {
		if(primary != null && !primary.isBlank()) { return primary; }
		return fallback;
	}
}
