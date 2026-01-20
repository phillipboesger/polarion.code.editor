package boesger.polarion.copilot.services;

import java.util.HashMap;
import java.util.Map;

import boesger.polarion.copilot.config.LlmRequestConfig;
import boesger.polarion.copilot.core.logger.CopilotLogger;
import boesger.polarion.copilot.services.providers.AzureOpenAiProvider;
import boesger.polarion.copilot.services.providers.ILlmProvider;
import boesger.polarion.copilot.services.providers.LocalLlmProvider;
import boesger.polarion.copilot.services.providers.OpenAiProvider;

public class CopilotLlmService {

  private static final CopilotLogger log = new CopilotLogger(CopilotLlmService.class);
  private Map<String, ILlmProvider> providers = new HashMap<>();

  public CopilotLlmService() {
    registerProvider(new OpenAiProvider());
    registerProvider(new AzureOpenAiProvider());
    registerProvider(new LocalLlmProvider());
  }

  public void registerProvider(ILlmProvider provider) {
    providers.put(provider.getId(), provider);
  }

  public String processRequest(LlmRequestConfig config, String content) throws Exception {
    String providerId = config.getProviderId();
    if (providerId == null) {
      // Fallback or default?
      providerId = "openai";
    }

    ILlmProvider provider = providers.get(providerId);
    if (provider == null) {
      // Try to match "ollama" to "local"
      if ("ollama".equalsIgnoreCase(providerId)) {
        provider = providers.get("local");
      }
    }

    if (provider == null) {
      throw new IllegalArgumentException("Unknown LLM Provider: " + providerId);
    }

    log.info("Processing LLM request for provider: " + provider.getId());
    return provider.processRequest(config, content);
  }

  public boolean testConnection(LlmRequestConfig config) {
    String providerId = config.getProviderId();
    if (providerId == null) {
      providerId = "openai";
    }
    ILlmProvider provider = providers.get(providerId);
    if (provider == null) {
      if ("ollama".equalsIgnoreCase(providerId)) {
        provider = providers.get("local");
      }
    }

    if (provider != null) {
      return provider.testConnection(config);
    }
    return false;
  }
}
