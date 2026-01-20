package boesger.polarion.copilot.services.providers;

import boesger.polarion.copilot.config.LlmRequestConfig;

/**
 * Interface for LLM Providers.
 */
public interface ILlmProvider {

  /**
   * Gets the unique ID of the provider (e.g. "openai").
   */
  String getId();

  /**
   * Processes a chat request.
   * 
   * @param config  The configuration for the request.
   * @param message The user message/prompt content.
   * @return The response text from the LLM.
   * @throws Exception if the request fails.
   */
  String processRequest(LlmRequestConfig config, String message) throws Exception;

  /**
   * Tests the connection to the provider with the given configuration.
   * 
   * @param config The configuration to test.
   * @return true if connection is successful, false otherwise.
   */
  boolean testConnection(LlmRequestConfig config);
}
