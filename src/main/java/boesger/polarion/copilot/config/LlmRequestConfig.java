package boesger.polarion.copilot.config;

import java.util.Map;

/**
 * Configuration DTO for an LLM call.
 * Ported from biz.avasis.polarion.copilot.config.
 */
public class LlmRequestConfig {

  private String providerId; // e.g. "openai", "azure-openai", "ollama"
  private String baseUrl; // e.g. "https://api.openai.com/v1/chat/completions"
  private String model; // e.g. "gpt-4o-mini"
  private String apiKey; // Directly the API key or a Vault reference
  private String systemPrompt; // System prompt from JSON
  private String userPrompt; // User prompt template from JSON with placeholders
  private Integer maxOutputTokens; // Optional limitation of response length
  private Map<String, String> providerHeaders; // Optional additional/overriding HTTP headers

  // Getters and Setters

  public String getProviderId() {
    return providerId;
  }

  public void setProviderId(String providerId) {
    this.providerId = providerId;
  }

  public String getBaseUrl() {
    return baseUrl;
  }

  public void setBaseUrl(String baseUrl) {
    this.baseUrl = baseUrl;
  }

  public String getModel() {
    return model;
  }

  public void setModel(String model) {
    this.model = model;
  }

  public String getApiKey() {
    return apiKey;
  }

  public void setApiKey(String apiKey) {
    this.apiKey = apiKey;
  }

  public String getSystemPrompt() {
    return systemPrompt;
  }

  public void setSystemPrompt(String systemPrompt) {
    this.systemPrompt = systemPrompt;
  }

  public String getUserPrompt() {
    return userPrompt;
  }

  public void setUserPrompt(String userPrompt) {
    this.userPrompt = userPrompt;
  }

  public Integer getMaxOutputTokens() {
    return maxOutputTokens;
  }

  public void setMaxOutputTokens(Integer maxOutputTokens) {
    this.maxOutputTokens = maxOutputTokens;
  }

  public Map<String, String> getProviderHeaders() {
    return providerHeaders;
  }

  public void setProviderHeaders(Map<String, String> providerHeaders) {
    this.providerHeaders = providerHeaders;
  }
}
