# Polarion CodeEditor Plugin

A **VS Code-like file editor** for Polarion ALM, available directly inside the Polarion Administration panel. Edit configuration files, Velocity macros, and other text-based repository files with syntax highlighting, a hierarchical file explorer, and full CRUD operations — all without leaving Polarion.

---

## Table of Contents

- [Features](#features)
- [How It Looks](#how-it-looks)
- [Prerequisites](#prerequisites)
- [Build & Installation](#build--installation)
- [Usage](#usage)
- [Branding & Legal Notice](#branding--legal-notice)
- [REST API Reference](#rest-api-reference)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **VS Code-style Monaco Editor** — the same editor engine that powers VS Code, with syntax highlighting for JSON, XML, and Velocity templates.
- **File Explorer sidebar** — hierarchical tree view of all editable files in the Polarion repository.
- **Full CRUD operations** — create, read, update, delete, and rename files directly in the Polarion repository.
- **Project-aware scoping** — automatically detects the current Polarion project from the URL and shows project-specific files alongside global ones.
- **Transaction-safe writes** — all file writes are wrapped in Polarion repository transactions, ensuring consistency.
- **Keyboard shortcut support** — save files with `Ctrl+S` / `Cmd+S`.
- **Resizable & collapsible sidebar** — drag to resize or collapse the explorer; width is persisted between sessions.
- **Unsaved-changes protection** — the browser warns before navigating away with unsaved edits.
- **Dark theme** — consistent with VS Code's default dark appearance.
- **Free to use** — the plugin remains fully free to use (Apache 2.0).

---

## How It Looks

The editor is embedded directly in the Polarion Administration panel:

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPLORER              «   │  config.json               [Save] │
│  ─────────────────────     │ ──────────────────────────────────  │
│  ▼ project/               │  1  {                              │
│      config.json       ✎ ✕ │  2    "key": "value"              │
│      settings.json     ✎ ✕ │  3  }                              │
│  ▼ macros/                 │                                    │
│      document.vm       ✎ ✕ │                                    │
│                            │                                    │
└─────────────────────────────────────────────────────────────────┘
```

- **Left panel**: File explorer showing all editable files and folders.
- **Right panel**: Monaco Editor with syntax highlighting.
- **Toolbar**: Current file path, Save button, New File button, and Copy-to-clipboard.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **Polarion ALM** | Version 2304 (23.4) or later recommended |
| **Java** | JDK 11 or later |
| **Maven** | 3.6 or later |
| **Polarion Parent POM** | `biz.avasis.polarion:masterpom-plugins:1.6.1` (must be available in your Maven repository) |

> **Note:** The plugin is deployed as an OSGi bundle inside Polarion. No external server or database is required.

---

## Build & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/phillipboesger/polarion.codeEditor.git
cd polarion.codeEditor
```

### 2. Build the JAR

```bash
mvn clean package
```

The output JAR is located at `target/polarion-code-editor-<version>.jar`.

### 3. Deploy to Polarion

Copy the built JAR into your Polarion installation's plugin directory:

```bash
cp target/polarion-code-editor-*.jar <POLARION_HOME>/polarion/plugins/
```

Restart the Polarion server to activate the plugin.

### 4. Verify Installation

After restarting, navigate to **Polarion Administration** and look for the **"CodeEditor"** entry in the left-hand navigation tree. If it appears, the plugin is installed correctly.

---

## Usage

### Accessing the Editor

The CodeEditor is accessible from:

- **Polarion Administration** → **CodeEditor**

The editor automatically detects the current scope (global, project, or project group) from the Polarion URL.

## Branding & Legal Notice

This plugin includes subtle branding (custom navigation/editor icon and in-editor attribution) while remaining fully **free to use**.

- Website: [https://digital.boesger.com](https://digital.boesger.com)
- Legal Notice: [https://digital.boesger.com/impressum](https://digital.boesger.com/impressum)
- Feedback & Requests: [GitHub Issues](https://github.com/phillipboesger/polarion.fileEditor/issues)

There is no paywall, no license key, and no feature limitation introduced by the branding.

### Editing Files

1. **Browse files** in the left-hand explorer panel.
2. **Click a file** to open it in the Monaco Editor.
3. **Edit** the file content.
4. **Save** with `Ctrl+S` / `Cmd+S`, or click the **Save** button in the toolbar.

### Creating a New File

1. Click the **New File** button in the toolbar.
2. Enter a repository-relative path (e.g., `config/myconfig.yaml`).
3. Any file extension is supported (e.g. `.json`, `.yaml`, `.xml`, `.vm`, `.sh`, `.md`, …).
4. Click **Create**.

### Renaming a File

1. Hover over a file in the explorer.
2. Click the **✎** (pencil) icon.
3. Enter the new path and confirm.

### Deleting a File

1. Hover over a file in the explorer.
2. Click the **✕** icon.
3. Confirm the deletion.

## File Scope

Files are read and written directly in the Polarion SVN-based repository.

- In project scope, project files are shown first and can override global files with the same path.
- In global scope, global repository files are shown.
- No plugin-specific settings file is used.

## Permissions

The editor is protected by Polarion permissions and checked server-side on every API call.

- `boesger.codeeditor.read`
  - Required for all read operations (for example `GET /api/config/list`, `GET /api/config/file/...`, `GET /api/config/health`).
  - Also controls whether the Code Editor navigation entry is visible.
- `boesger.codeeditor.write`
  - Required for all write operations (`PUT`, `POST`, `DELETE`).

The permissions are declared in `META-INF/permissions.xml` and can be assigned in Polarion like other standard permissions.
Additionally, the plugin grants effective read/write access by default for users with global role `admin` or project role `project_admin`.

### Optional: Permissions Management UI helper (JS injection)

To simplify managing the two custom permissions in Polarion's standard **Permissions Management** page, this plugin ships a helper script:

- `/polarion/code-editor/resources/permissions-injection.js`

The script is intentionally client-side only and injects missing table rows for these permissions directly into the standard permissions matrix so they can be configured like native entries:

- `boesger.codeeditor.read`
- `boesger.codeeditor.write`

#### Preferred (automatic, if your Polarion setup supports global script injection)

Register this script in your existing Polarion-wide HTML/script injection mechanism so it is loaded on standard UI pages:

```html
<script src="/polarion/code-editor/resources/permissions-injection.js"></script>
```

#### Fallback (manual)

If automatic loading is not available in your instance, keep the same script tag in your manual script injection/configuration entry.

The injection is idempotent and only activates on pages that look like the permissions management UI.

---

## REST API Reference

The plugin exposes a REST API at `/polarion/code-editor/api/config/`. All endpoints require an authenticated Polarion session.

### Health Check

```
GET /api/config/health
```

**Response:** `200 OK` with body `OK`

---

### List Files

```
GET /api/config/list?projectId=<id>
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `projectId` | string | No | Polarion project ID. Omit for global scope. |

**Response:** JSON array of file objects.

```json
[
  {
    "name": "config.json",
    "path": "code-editor/config.json",
    "projectId": "MyProject"
  }
]
```

---

### Get File Content

```
GET /api/config/file/<fileName>?projectId=<id>
```

**Response:** `200 OK` with plain-text file content.

---

### Create or Update File

```
PUT /api/config/file/<fileName>?projectId=<id>
```

**Request body:** Plain text (file content).

**Response:** `200 OK` on success.

---

### Delete File

```
DELETE /api/config/file/<fileName>?projectId=<id>
```

**Response:** `200 OK` on success.

---

### Rename File

```
POST /api/config/rename?projectId=<id>
```

**Request body (JSON):**

```json
{
  "oldName": "code-editor/old-name.json",
  "newName": "code-editor/new-name.json"
}
```

**Response:** `200 OK` on success.

---

## Architecture

### Overview

```
Polarion Administration Panel
        │
        ▼
editor.html  (Monaco Editor UI)
        │  fetch()
        ▼
CodeEditorServlet  (/api/config/*)
        │
        ▼
CodeEditorService  (business logic)
        │
        ├─ SaveFileAction
        ├─ DeleteFileAction
        ├─ RenameFileAction
        └─ CopyFileAction
                │  Polarion Transaction
                ▼
     Polarion Repository (SVN)
```

### Key Components

| Component | Package | Description |
|---|---|---|
| `CodeEditorServlet` | `api` | HTTP entry point; routes GET/PUT/DELETE/POST requests |
| `CodeEditorService` | `service` | Core business logic; file listing, reading, writing |
| `SaveFileAction` | `service` | Transactional file create/update |
| `DeleteFileAction` | `service` | Transactional file delete |
| `RenameFileAction` | `service` | Transactional file rename/move |
| `CopyFileAction` | `service` | Transactional file copy |
| `RepoFile` | `model` | Data model for a repository file |
| `PolarionUtils` | `util` | Utility methods for Polarion service access and transactions |
| `CodeEditorException` | `exception` | Plugin-specific exception type |
| `PluginLogger` | `logger` | Structured logging with debug mode |

### Polarion Integration

The plugin registers a custom main-navigation topic via `META-INF/hivemodule.xml`:

```xml
<service-point id="code-editor-navigation-extender"
    interface="com.polarion.alm.ui.server.navigation.NavigationExtender">
    <invoke-factory>
        <construct class="boesger.polarion.codeeditor.navigation.CodeEditorNavigationExtender"/>
    </invoke-factory>
</service-point>

<contribution configuration-id="customNavigationExtenders">
    <extenders extender="code-editor-navigation-extender"/>
</contribution>
```

This places **Code Editor** as its own block in the normal Polarion sidebar and as an entry in the Administration sidebar.

### Frontend Stack

| Technology | Purpose |
|---|---|
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | VS Code editor engine (syntax highlighting, themes) |
| Vanilla JavaScript (ES6+) | UI logic, fetch API calls, state management |
| CSS custom properties | VS Code-inspired dark theme |

---

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork** the repository.
2. **Create a branch** for your feature or bugfix: `git checkout -b feature/my-feature`.
3. **Commit** your changes with a clear message.
4. **Push** the branch and open a **Pull Request** against `main`.

### Building & Testing

```bash
# Build
mvn clean package

# Run unit tests
mvn test
```

Tests are located in `src/test/java` and use JUnit 4 with Mockito.

### Code Style

- Java code follows standard Java conventions.
- Keep servlet logic thin; business logic belongs in the service layer.
- Wrap all repository writes in a Polarion transaction via `PolarionUtils.executeInTransactionWithResult()`.
- Use `PluginLogger` for all logging — do not use `System.out` or raw `java.util.logging`.

---

## License

This project is licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for details.
