package boesger.polarion.copilot.services.providers;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import boesger.polarion.copilot.config.LlmRequestConfig;
import boesger.polarion.copilot.core.logger.CopilotLogger;

public class AzureOpenAiProvider implements ILlmProvider {

  private static final CopilotLogger log = new CopilotLogger(AzureOpenAiProvider.class);

  @Override
  public String getId() {
    return "azure-openai";
  }

  @Override
  public String processRequest(LlmRequestConfig config, String message) throws Exception {
    // Expected Base URL format:
    // https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={version}
    String url = config.getBaseUrl();
    String apiKey = config.getApiKey();

    if (url == null || url.isEmpty()) {
      throw new IllegalArgumentException("Azure OpenAI requires a Base URL.");
    }

    try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
      HttpPost httpPost = new HttpPost(url);
      httpPost.setHeader("Content-Type", "application/json");
      httpPost.setHeader("api-key", apiKey);

      JsonObject jsonBody = new JsonObject();

      JsonArray messages = new JsonArray();
      if (config.getSystemPrompt() != null && !config.getSystemPrompt().isEmpty()) {
        JsonObject systemMsg = new JsonObject();
        systemMsg.addProperty("role", "system");
        systemMsg.addProperty("content", config.getSystemPrompt());
        messages.add(systemMsg);
      }
      JsonObject userMsg = new JsonObject();
      userMsg.addProperty("role", "user");
      userMsg.addProperty("content", message);
      messages.add(userMsg);

      jsonBody.add("messages", messages);

      if (config.getMaxOutputTokens() != null) {
        jsonBody.addProperty("max_tokens", config.getMaxOutputTokens());
      }

      StringEntity entity = new StringEntity(jsonBody.toString(), StandardCharsets.UTF_8);
      httpPost.setEntity(entity);

      try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
        int statusCode = response.getStatusLine().getStatusCode();
        String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

        if (statusCode >= 200 && statusCode < 300) {
          JsonObject responseJson = JsonParser.parseString(responseBody).getAsJsonObject();
          return responseJson.getAsJsonArray("choices").get(0).getAsJsonObject().get("message").getAsJsonObject()
              .get("content").getAsString();
        } else {
          throw new IOException("Azure OpenAI request failed with status " + statusCode + ": " + responseBody);
        }
      }
    } catch (Exception e) {
      log.error("Error calling Azure OpenAI", e);
      throw e;
    }
  }

  @Override
  public boolean testConnection(LlmRequestConfig config) {
    try {
      LlmRequestConfig testConfig = new LlmRequestConfig();
      testConfig.setBaseUrl(config.getBaseUrl());
      testConfig.setApiKey(config.getApiKey());
      testConfig.setSystemPrompt("You are a helpful assistant.");
      testConfig.setMaxOutputTokens(1);
      processRequest(testConfig, "Hello");
      return true;
    } catch (Exception e) {
      log.warn("Connection test failed for Azure OpenAI: " + e.getMessage());
      return false;
    }
  }
}
