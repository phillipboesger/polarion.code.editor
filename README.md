## avasis Polarion Copilot Plugin

The avasis Polarion Copilot plugin integrates an AI-based assistant ("avaCopilot") into Polarion ALM. It adds a context-aware icon next to configured rich text fields, offering actions such as document comparison and an informational "About" dialog.

### Features

- Copilot icon rendered next to specific Polarion rich text fields
- Context menu with pluggable actions (e.g. compare versions, about)
- Dedicated styling and dialog markup for the Copilot UI

### Project Structure (excerpt)

- `src/main/webapp/resources/js/avaCopilot-init.js` – client-side initialization logic, icon placement and context menu handling
- `src/main/webapp/resources/css/avaCopilot-main.css` – styles for Copilot icon, menu and about dialog
- `src/main/webapp/resources/html/avaCopilot-about.html` – HTML fragment for the Copilot "About" dialog
- `plugin.xml` – Polarion plugin descriptor

### Configuration

- Copilot-enabled fields and actions are currently configured statically in `avaCopilot-init.js` via `AVA_COPILOT_CONFIG`.
- In future versions this configuration can be externalized (e.g. JSON/XML) and extended with further AI actions.

### Contact

For questions regarding avaCopilot or this plugin, please contact avasis Solutions GmbH:

- E-mail: `polarion@avasis.biz`
- Web: https://www.avasis.biz
