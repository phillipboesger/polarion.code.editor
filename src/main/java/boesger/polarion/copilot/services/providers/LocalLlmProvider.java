package boesger.polarion.copilot.services.providers;

import boesger.polarion.copilot.config.LlmRequestConfig;

/**
 * Provider for Local LLMs (e.g. Ollama via OpenAI compatible API).
 */
public class LocalLlmProvider extends OpenAiProvider {

  @Override
  public String getId() {
    return "local";
  }

  @Override
  public String processRequest(LlmRequestConfig config, String message) throws Exception {
    // Defaults to Ollama port if not set
    if (config.getBaseUrl() == null || config.getBaseUrl().isEmpty()) {
      config.setBaseUrl("http://localhost:11434/v1/chat/completions");
    }
    return super.processRequest(config, message);
  }
}
