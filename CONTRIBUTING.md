# Contributing to Polarion Code Editor

Thanks for your interest in improving this plugin! Contributions are welcome in the forms described below.

> **Licence:** This project is licensed under the [Apache License 2.0](LICENSE). By submitting a pull request you agree that your contribution will be made available under the same licence.

---

## How You Can Help

### 🐛 Reporting Bugs

Open a [Bug Report issue](https://github.com/phillipboesger/polarion.code.editor/issues/new?template=bug_report.yml).

Please include:
- Your Polarion version
- The plugin version (from the JAR filename or `pom.xml`)
- Steps to reproduce
- Relevant log output from the Polarion server

### 💡 Suggesting Features

Open a [Feature Request issue](https://github.com/phillipboesger/polarion.code.editor/issues/new?template=feature_request.yml) and describe the problem you want to solve and your proposed solution.

### ❓ Asking Questions

Use [GitHub Discussions → Q&A](https://github.com/phillipboesger/polarion.code.editor/discussions/categories/q-a) for general questions about installation, configuration, or usage. Issues are reserved for confirmed bugs and actionable feature requests.

### 🔧 Submitting Code Changes

1. **Fork** the repository and create a feature branch from `main`.
2. **Build locally** — you need Maven and JDK 21. The default profile builds the
   Polarion 2512 (javax) JAR; add `-Ppolarion-2606` for the Polarion 2606 (jakarta) JAR:
   ```bash
   mvn clean package -DskipTests                 # …-polarion2512.jar (Tomcat 9 / javax)
   mvn clean package -DskipTests -Ppolarion-2606 # …-polarion2606.jar (Tomcat 11 / jakarta)
   ```
   > The servlet exists as two source variants (`src/main/java-javax` and
   > `src/main/java-jakarta`) kept identical except for the servlet namespace. If you
   > touch `CodeEditorServlet`, change **both** — `CodeEditorServletVariantParityTest`
   > fails the build otherwise.
3. **Test your change** against a running Polarion 2512 **or** 2606 instance by deploying the matching JAR to `<POLARION_HOME>/polarion/plugins/` and restarting the server.
4. **Open a Pull Request** against the `main` branch with a clear description of what you changed and why.

#### PR checklist

- [ ] The plugin builds successfully (`mvn clean package`)
- [ ] The change has been tested against a real Polarion instance
- [ ] The PR description explains the motivation and what was changed
- [ ] No new dependencies have been added without a good reason

---

## Development Setup

| Requirement | Version          |
|-------------|------------------|
| Java (JDK)  | 21 or later      |
| Maven       | 3.9 or later     |
| Node.js     | 18 or later      |
| Polarion    | 2512 **or** 2606 |

Build the JARs (one per Polarion platform — see the [Compatibility Policy](README.md#compatibility-policy)):

```bash
mvn clean package -DskipTests                 # target/…-polarion2512.jar (Polarion 2512 / javax)
mvn clean package -DskipTests -Ppolarion-2606 # target/…-polarion2606.jar (Polarion 2606 / jakarta)
```

Copy the artifact matching your Polarion version to your Polarion plugins directory and restart the server to pick up changes.

---

## Running Tests

### Java Unit Tests

```bash
mvn test
```

### UI Tests (Playwright)

`node_modules` and the browser binaries are **not** committed to the repository (they are listed in `.gitignore`). After a fresh clone — or whenever the `tests/ui/package-lock.json` changes — run the following one-time setup:

```bash
cd tests/ui
npm ci                   # installs packages from package-lock.json
npx playwright install   # downloads browser binaries (~200 MB)
```

Once set up, run the tests against a running Polarion instance:

```bash
npm test
```

> **Note:** The browser binaries are stored in `~/.cache/ms-playwright` (macOS/Linux) and must be reinstalled whenever you switch machines or delete that cache directory.

---

## Code Style

- Follow the existing code style in each file.
- Use `boesger.polarion.copilot.core.logger.CopilotLogger` for all logging — no `System.out` or raw `java.util.logging`.
- Keep pull requests focused: one concern per PR makes review faster.
