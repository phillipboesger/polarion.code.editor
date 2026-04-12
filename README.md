# Polarion Code Editor

A **VS Code-like file editor** built right into Polarion ALM — edit Velocity macros, JSON configs, XML enumerations, and any other text-based repository file without ever leaving Polarion.

> **Free to use** — no license key, no paywall, no feature limitations. Apache 2.0.

---

## Table of Contents

- [What Is This?](#what-is-this)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Usage](#usage)
- [Permissions](#permissions)
- [What You Can (and Cannot) Do](#what-you-can-and-cannot-do)
- [Bugs & Feature Requests](#bugs--feature-requests)
- [Contributing](#contributing)
- [Branding & Legal Notice](#branding--legal-notice)
- [License](#license)

---

## What Is This?

The **Polarion Code Editor** is a server-side OSGi plugin for Polarion ALM that adds a full-featured code editor to the Polarion Administration panel. It uses the same [Monaco Editor](https://microsoft.github.io/monaco-editor/) engine that powers VS Code, so you get syntax highlighting, a familiar dark theme, and keyboard shortcuts out of the box.

**Highlights:**

- Browse and edit files in the Polarion SVN repository directly in the browser.
- Syntax highlighting for `.json`, `.xml`, `.vm`, `.yaml`, `.sh`, `.md`, and more.
- Create, rename, and delete files — all via a simple file explorer sidebar.
- Project-aware: automatically scopes to the current Polarion project.
- Keyboard shortcuts (`Ctrl+S` / `Cmd+S` to save).
- Warns before you navigate away with unsaved changes.
- No additional server, database, or cloud service required.

---

## Screenshots

### Code Editor entry in the Polarion sidebar

<img src="https://github.com/user-attachments/assets/2143d7db-18ba-44c1-bf88-7fdeaa6e1e25" alt="Polarion sidebar showing the Code Editor navigation entry" width="260"/>

### Multiple files open in tabs

<img src="https://github.com/user-attachments/assets/197ab388-a2eb-4618-b594-3d978340210e" alt="Tab bar with mainLogic.vm, llmConfig.json and workitem-type-enum.xml open"/>

### The Code Editor navigation icon

<img src="https://github.com/user-attachments/assets/7d2ad821-c901-4f6b-a7ed-7380cbbb5227" alt="Code Editor navigation icon" width="260"/>

### File explorer with repository structure

<img src="https://github.com/user-attachments/assets/44625fbb-bb8e-4b53-a3e5-43f75afd67e5" alt="Full editor UI showing the file explorer on the left and the editor on the right"/>

---

## Installation

### Requirements

| Requirement | Version |
|---|---|
| Polarion ALM | 2304 (23.4) or later |
| Java | JDK 21 or later |
| Maven | 3.8 or later |

### 1. Download or Build the Plugin JAR

**Option A — Build from source:**

```bash
git clone https://github.com/phillipboesger/polarion.fileEditor.git
cd polarion.fileEditor
mvn clean package
```

The JAR is created at `target/polarion-code-editor-<version>.jar`.

**Option B — Download a release:**

Grab the latest JAR from the [Releases page](https://github.com/phillipboesger/polarion.fileEditor/releases).

### 2. Deploy to Polarion

Copy the JAR into your Polarion plugins directory:

```bash
cp target/polarion-code-editor-*.jar <POLARION_HOME>/polarion/plugins/
```

Then **restart the Polarion server**.

### 3. Verify

After restarting, open Polarion and look for the **Code Editor** entry in the left-hand navigation sidebar (see screenshot above). If it appears, the plugin is active.

---

## Usage

### Opening the Editor

Navigate to **Polarion Administration → Code Editor** (or click the Code Editor entry in the main sidebar). The editor opens in the context of the current project (or globally if accessed from the Administration panel).

### Editing a File

1. Browse the **file explorer** on the left to find the file you want to edit.
2. Click the file to open it in the editor.
3. Make your changes.
4. Press **`Ctrl+S`** / **`Cmd+S`** or click the **Save** button in the top-right corner.

You can have multiple files open at once — they appear as tabs at the top of the editor.

### Creating a New File

1. Click **New File** in the top-left of the explorer panel.
2. Enter a name or path (e.g., `config/myconfig.yaml`).
3. Press **Create**.

> New files are always created inside the plugin's dedicated `.file-editor/` folder in the Polarion repository.

### Renaming a File

1. Hover over a file in the explorer.
2. Click the **pencil ✎** icon.
3. Enter the new name and confirm.

### Deleting a File

1. Hover over a file in the explorer.
2. Click the **✕** icon.
3. Confirm the deletion.

### Font Size

Use the **A−**, **A**, **A+** buttons in the toolbar to decrease, reset, or increase the editor font size.

---

## Permissions

The plugin uses two Polarion permissions that can be assigned to roles in the standard Permissions Management page:

| Permission | What it controls |
|---|---|
| `boesger.codeeditor.read` | Required to view the Code Editor navigation entry and read any file |
| `boesger.codeeditor.write` | Required to create, update, rename, or delete files |

Both permissions are checked server-side on every API call.

**Default access:** Users with the global role `admin` or project role `project_admin` automatically receive both read and write access.

### Making the Permissions Visible in the UI

The plugin ships an optional helper script that injects the two permissions into Polarion's standard Permissions Management matrix so they can be managed like any built-in permission:

```html
<script src="/polarion/code-editor/resources/permissions-injection.js"></script>
```

Add this to your Polarion-wide HTML/script injection configuration. The script is client-side only and idempotent — it only activates on the Permissions Management page.

---

## What You Can (and Cannot) Do

### ✅ You Can

- Edit any text-based file that is listed in the file explorer.
- Create new files inside the `.file-editor/` folder.
- Rename or delete files that were created through the plugin.
- Use the editor commercially, in your own Polarion instance, free of charge.
- Fork and modify the plugin under the terms of the Apache 2.0 license.

### ❌ You Cannot

- Write files outside the `.file-editor/` folder — the backend enforces this automatically; path traversal and writes to arbitrary locations are blocked server-side.
- Bypass Polarion's permission system — all API calls require a valid, authenticated Polarion session and the appropriate `read`/`write` permission.
- Remove or hide the "Made by Boesger Digital" attribution in the editor footer (see [Branding & Legal Notice](#branding--legal-notice)).

---

## Bugs & Feature Requests

Found a bug? Have an idea for a new feature? Please use **GitHub Issues**:

👉 **[Open an issue](https://github.com/phillipboesger/polarion.fileEditor/issues)**

When reporting a bug, please include:
- Your Polarion version
- The plugin version (visible in the JAR filename or `pom.xml`)
- Steps to reproduce the problem
- Any relevant error messages from the Polarion server log

---

## Contributing

Contributions are welcome!

1. **Fork** the repository.
2. **Create a branch**: `git checkout -b feature/my-feature` or `fix/my-bug`.
3. **Commit** your changes with a clear message.
4. **Push** and open a **Pull Request** against `main`.

### Building & Testing

```bash
# Build
mvn clean package

# Run tests
mvn test
```

Tests are in `src/test/java` and use JUnit 4 with Mockito.

### Code Guidelines

- Keep servlet logic thin — business logic belongs in the service layer.
- Wrap all repository writes in a Polarion transaction via `PolarionUtils.executeInTransactionWithResult()`.
- Use `PluginLogger` for logging — do not use `System.out` or raw `java.util.logging`.

---

## Branding & Legal Notice

The plugin includes subtle branding (a custom navigation icon and a footer attribution "Made by Boesger Digital") while remaining fully free. There is no paywall, no license key, and no feature limitation.

- Website: [https://digital.boesger.com](https://digital.boesger.com)
- Legal Notice: [https://digital.boesger.com/imprint/](https://digital.boesger.com/imprint/)

---

## License

This project is licensed under the **Apache License, Version 2.0**. See the [LICENSE](LICENSE) file for details.
