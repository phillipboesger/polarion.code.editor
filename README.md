## avasis Polarion Copilot Plugin

The avasis Polarion Copilot plugin integrates an AI-based assistant ("avaCopilot") into Polarion ALM. It provides AI-powered actions such as intelligent document comparison or content generation directly within the Polarion UI.

### Features

- Adds a "Copilot" icon next to configured rich text fields (or other UI elements).
- Provides a context menu with customizable actions (e.g., "Compare to last version", "Generate summary").
- Supports different UI modes for action results: `writeToField` (updates the field content), `sidePanel` (shows results in a panel), or `dialog` (opens a detailed view).
- Flexible configuration via JSON files stored in the `.avasis` repository folder, supporting global and project-specific settings.
- Integrated Swagger UI for API exploration.

### Prerequisites

To use this plugin, the following requirements must be met:

1.  **License**: A valid avasis license for `biz.avasis.polarion.copilot` is required.
2.  **Core Plugin**: The `biz.avasis.polarion.core` plugin must be installed in version **3.20.2** or higher.

### Configuration & Examples

The plugin looks for configuration files in the `.avasis` folder of your Polarion repository (either globally or per project).

An example configuration set for **Document Comparison** is provided in the plugin's resource folder (`src/main/webapp/resources/examples/avaCopilot-documentCompare`). These files can be copied to your `.avasis/avaCopilot` folder in the repository to enable the feature.

#### 1. Action Configuration (`documentCompare.json`)

This file defines which fields should have the Copilot icon and what actions are available.

**Example Structure:**

```json
{
  "fields": [
    {
      "id": "FIELD_changeContent", // The ID of the field to attach the icon to
      "actions": [
        "compareLast", // Reference to an action defined below
        "compareVersion"
      ]
    }
  ],
  "actions": {
    "compareLast": {
      "label": "Compare to last document version",
      "iconPath": "avaCopilot/icons/compareLast.svg", // Path to icon in .avasis folder
      "uiMode": "writeToField", // UI Mode (see below)
      "backend": {
        "type": "velocity",
        "includeDocumentContext": true,
        "avasisPath": "avaCopilot/documentCompare.vm", // Path to logic script
        "params": {
          "macroName": "compareLast"
        }
      }
    }
    // ... further actions
  }
}
```

**UI Modes:**

- `writeToField`: The result of the action (e.g., generated text) is written directly into the field where the action was triggered. Useful for generating content or filling fields.
- `sidePanel`: Opens a collaborative side panel to display the result. Useful for comparisons, chats, or temporary information.
- `dialog`: Opens a modal dialog.

#### 2. LLM Configuration (`llm-config.json`)

This file defines the connection parameters for the Large Language Model (LLM).

**Example Structure:**

```json
{
  "providerId": "openai",
  "baseUrl": "https://api.openai.com/v1/chat/completions",
  "model": "gpt-4-mini",
  "apiKey": "sk-proj-...", // API Key (or alias for User Account Vault)
  "systemPrompt": "You are a...", // Instructions for the AI
  "userPrompt": "Compare..." // Template for the user request
}
```

_Note: Currently, only OpenAI models (providerId: `openai`) are fully tested and supported._

#### 3. Logic Script (`documentCompare.vm`)

This Velocity script implements the actual business logic of the actions. It prepares data (e.g., fetches old document versions) and calls the Copilot service (`$ava-copilot`) to interact with the LLM.

### API & Swagger UI

The plugin exposes a REST API for managing configurations and resources. You can explore and test the API using the built-in Swagger UI.

**Accessing Swagger UI:**
Open the following URL in your browser (adjust host and port as needed):
`http://<polarion-server>/polarion/ava-copilot/resources/html/copilot-swagger.html`

This UI allows you to see available endpoints, parameters, and response formats.

### Contact

For questions regarding avaCopilot or this plugin, please contact avasis Solutions GmbH:

- E-mail: `polarion@avasis.biz`
- Web: https://www.avasis.biz
