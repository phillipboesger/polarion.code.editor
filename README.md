# Polarion File Editor Plugin

A **VS Code-like file editor** for Polarion ALM, available directly inside the Polarion Administration panel. Edit configuration files, Velocity macros, and other text-based repository files with syntax highlighting, a hierarchical file explorer, and full CRUD operations — all without leaving Polarion.

---

## Table of Contents

- [Features](#features)
- [How It Looks](#how-it-looks)
- [Prerequisites](#prerequisites)
- [Build & Installation](#build--installation)
- [Usage](#usage)
- [Configuration & File Storage](#configuration--file-storage)
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
- **Configurable additional folders** — extend the editor to show files from any repository path, not just `.file-editor/`.
- **Transaction-safe writes** — all file writes are wrapped in Polarion repository transactions, ensuring consistency.
- **Keyboard shortcut support** — save files with `Ctrl+S` / `Cmd+S`.
- **Resizable & collapsible sidebar** — drag to resize or collapse the explorer; width is persisted between sessions.
- **Unsaved-changes protection** — the browser warns before navigating away with unsaved edits.
- **Dark theme** — consistent with VS Code's default dark appearance.

---

## How It Looks

The editor is embedded directly in the Polarion Administration panel:

```
┌─────────────────────────────────────────────────────────────────┐
│  EXPLORER              «   │  .file-editor/config.json   [Save] │
│  ─────────────────────     │ ──────────────────────────────────  │
│  ▼ .file-editor/           │  1  {                              │
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
git clone https://github.com/phillipboesger/polarion.fileEditor.git
cd polarion.fileEditor
```

### 2. Build the JAR

```bash
mvn clean package
```

The output JAR is located at `target/polarion-file-editor-<version>.jar`.

### 3. Deploy to Polarion

Copy the built JAR into your Polarion installation's plugin directory:

```bash
cp target/polarion-file-editor-*.jar <POLARION_HOME>/polarion/plugins/
```

Restart the Polarion server to activate the plugin.

### 4. Verify Installation

After restarting, navigate to **Polarion Administration** and look for the **"File Editor"** entry in the left-hand navigation tree. If it appears, the plugin is installed correctly.

---

## Usage

### Accessing the Editor

The File Editor is accessible from:

- **Polarion Administration** → **File Editor**

The editor automatically detects the current scope (global, project, or project group) from the Polarion URL.

### Editing Files

1. **Browse files** in the left-hand explorer panel.
2. **Click a file** to open it in the Monaco Editor.
3. **Edit** the file content.
4. **Save** with `Ctrl+S` / `Cmd+S`, or click the **Save** button in the toolbar.

### Creating a New File

1. Click the **New File** button in the toolbar.
2. Enter a path relative to `.file-editor/` (e.g., `config/myconfig.yaml`).
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

### Configuring Additional Folders

By default, the editor shows files under `.file-editor/`. To add more folders:

1. Click the **⚙** (settings) icon in the sidebar header.
2. Enter additional folder paths (one per line), relative to the project or global repository root.
3. Click **Save Settings**.

The settings are persisted in `.file-editor/file-editor-settings.json` within the repository.

---

## Configuration & File Storage

Files are stored directly in the Polarion SVN-based repository:

| Scope | Path |
|---|---|
| **Global** | `/.file-editor/` |
| **Project-specific** | `/<PROJECT_ID>/.file-editor/` |
| **Custom folders** | Configurable via `file-editor-settings.json` |

### Settings File Format

`.file-editor/file-editor-settings.json`:

```json
{
  "additionalFolders": [
    "macros",
    "scripts/velocity"
  ]
}
```

---

## REST API Reference

The plugin exposes a REST API at `/polarion/file-editor/api/config/`. All endpoints require an authenticated Polarion session.

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
    "path": ".file-editor/config.json",
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
  "oldName": ".file-editor/old-name.json",
  "newName": ".file-editor/new-name.json"
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
FileEditorServlet  (/api/config/*)
        │
        ▼
FileEditorService  (business logic)
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
| `FileEditorServlet` | `api` | HTTP entry point; routes GET/PUT/DELETE/POST requests |
| `FileEditorService` | `service` | Core business logic; file listing, reading, writing |
| `SaveFileAction` | `service` | Transactional file create/update |
| `DeleteFileAction` | `service` | Transactional file delete |
| `RenameFileAction` | `service` | Transactional file rename/move |
| `CopyFileAction` | `service` | Transactional file copy |
| `RepoFile` | `model` | Data model for a repository file |
| `PolarionUtils` | `util` | Utility methods for Polarion service access and transactions |
| `FileEditorException` | `exception` | Plugin-specific exception type |
| `PluginLogger` | `logger` | Structured logging with debug mode |

### Polarion Integration

The plugin registers itself as a Polarion Administration page extender via `META-INF/hivemodule.xml`:

```xml
<contribution configuration-id="com.polarion.xray.webui.administrationPageExtenders">
    <extender name="File Editor"
              pageUrl="/polarion/file-editor/editor.html"
              projectScope="true"
              projectGroupScope="true"
              repositoryScope="true" />
</contribution>
```

This places the **File Editor** entry in the Polarion Administration sidebar, available at global, project-group, and project level.

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
