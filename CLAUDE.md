# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A server-side OSGi plugin for **Polarion ALM** that embeds a Monaco (VS Code) editor into the Polarion Administration / User View. It browses and edits text and image files stored in the Polarion SVN repository over a small REST API. Backend is Java 21; frontend is a single static webapp. Supported: **Polarion 2512 and 2606, Java 21** (no backport to older Polarion or Java — deliberate policy, see README). Ships two JARs from one javax.servlet source tree — the default (no-suffix) jar targets Polarion 2606 (jakarta.servlet, primary target); a `-pre2606` jar targets Polarion 2512 (javax.servlet) during the migration window and will be dropped once those installs are retired. See "Dual-platform build" below.

> Note: `.github/copilot-instructions.md` is **stale** — it describes an unrelated "Copilot/LLM" plugin under `boesger.polarion.copilot`. The real code lives under `boesger.polarion.codeeditor`. Ignore that file.

## Build & test

```bash
mvn clean package            # build the deployable JAR (runs unit tests)
mvn --batch-mode verify      # what CI runs
mvn clean package -DskipTests
mvn test -Dtest=CodeEditorServiceTest              # single test class
mvn test -Dtest=CodeEditorServiceTest#methodName   # single test method
```

- The build needs the Polarion platform JARs (`com.polarion.*`), which are **not on Maven Central** — they come from our own private GitHub Packages mirror (`maven.pkg.github.com/phillipboesger/polarion-ootb-plugins`) and require a `github` server entry in `~/.m2/settings.xml` authenticated with a PAT that has `read:packages`. Without that, the build cannot resolve `provided`-scope Polarion dependencies. CI injects this via the `PACKAGES_TOKEN` secret.
- Surefire runs with `--add-opens` flags because Mockito needs reflection access under Java 21. Keep those `argLine` flags if you touch the surefire config.
- One `mvn package` produces **two** output JARs: `target/boesger.polarion.code-editor-<version>.jar` (default, Polarion 2606 / jakarta.servlet) and `target/boesger.polarion.code-editor-<version>-pre2606.jar` (legacy, Polarion 2512 / javax.servlet). Deploy the one matching your Polarion version by copying into `<POLARION_HOME>/polarion/plugins/` and restarting Polarion.

### Dual-platform build (Polarion 2512 + 2606)

Sources are **javax.servlet-only** (`CodeEditorServlet.java`, `WEB-INF/web.xml`) — do not hand-write a jakarta variant. `maven-jar-plugin` produces the javax build directly under the `pre2606` classifier; `org.eclipse.transformer:transformer-maven-plugin` (with `<extensions>true</extensions>` + `<classifier>-</classifier>`) rewrites its compiled bytecode and `web.xml` (via `src/main/transformer/*.properties`) to `jakarta.servlet`/Servlet 6.1 and becomes the project's **primary (no-suffix) artifact directly** — no post-package rename step, so `mvn install`/`mvn deploy` work correctly too. This is intentionally inverted from a naive "javax is the default" scheme, because Polarion 2606 is this project's primary target going forward.

Both JARs compile against the **stable 3.25.12 / 5.25.12** platform API and carry a 3.25.12 `Require-Bundle` floor. Do **not** bump `polarion.version` to 3.26.6 to "modernize": a `Require-Bundle` version is a *minimum*, so a 3.26.6 floor would stop the `-pre2606` jar resolving on Polarion 2512 — the only reason that jar exists. The 2606 API is covered instead by the `compile-2606` CI job, which recompiles with `-Dpolarion.version=3.26.6 -Dsubterra.version=5.26.6` as verification only (`test-compile`, no artifact, no manifest). If that job fails while `Build & Test` passes, fix the source — don't raise the floor. Full pattern and pitfalls: see the `polarion-2606-jakarta-migration` skill.

### UI tests (Playwright, separate)

Live in `tests/ui/` (own `package.json`, not part of the Maven build). They run against a real Polarion Docker container in CI (`.github/workflows/ui-tests.yml`).

```bash
cd tests/ui && npm ci && npx playwright install --with-deps
npm test           # all tests
npm run test:fast  # 1 worker, stop on first failure, line reporter
npm run test:debug # trace on
```

## Architecture

Request flow: **browser (Monaco in `editor.html`) → `CodeEditorServlet` (REST) → `CodeEditorService` → Polarion repository API**.

- **`api/CodeEditorServlet`** — the only HTTP entry point, mapped to `/polarion/code-editor/api/*` (see `web.xml`). Routes GET/PUT/DELETE/POST by `pathInfo`, does Gson (de)serialization, and gates every request behind `securityService.getCurrentUser() != null` (401 otherwise). Endpoints: `/health`, `/config/list`, `/config/file/{name}` (GET read/download, PUT save, DELETE), `/files/tree`, `/config/rename` (POST). A `projectId` query param scopes an operation to a project; omitting it means global/admin scope.
- **`service/CodeEditorService`** — all repository logic. Constructed per-request with a `projectId`. Reads go through a read-only connection; **every write goes through a `service/action/*` command** (`SaveFileAction`, `DeleteFileAction`, `RenameFileAction`, `CopyFileAction`) run inside `PolarionUtils.executeInTransactionWithResult(...)`. When adding a new mutating operation, follow this pattern: a small `RunnableWEx<T>` action wrapped in a transaction — do not call the write connection directly from the servlet or service.
- **Scope resolution** — a file name is resolved to an `ILocation` by `getFileRepoLocation`: it prefers the **project** location when a `projectId` is set and the file exists there, else falls back to the **global** repo root. `getFiles` merges project + global files and de-duplicates so project files shadow globals. Keep this project-then-global precedence in mind for any path handling.
- **`util/PolarionUtils`** — static holder for the looked-up Polarion services (`ITrackerService`, `ITransactionService`, `IRepositoryService`) plus the transaction helper. It has package-private `setXxxService` setters that exist **only so tests can inject Mockito doubles** — do not use them in production code.
- **`META-INF/hivemodule.xml`** — registers the admin page extender (`administrationPageExtenders`) that surfaces the Code Editor entry, plus the `customNavigationExtenders` sidebar contribution (`CodeEditorNavigationExtender`) for the User View entry. PR #47 deleted that sidebar contribution claiming Polarion 2606 had removed `com.polarion.alm.ui.server.navigation.NavigationExtender`; **that claim was false** and it was restored after being disproven against a live 2606 (3.26.6) install — the class, the `NavigationExtenderNode`, and the `customNavigationExtenders` configuration-point (module `com.polarion.xray.webui`, the same one providing `administrationPageExtenders`) all still ship, and the 2606 interface declares exactly the six abstract methods our class implements. The startup FATAL blamed on it was the duplicate-bundle loading in PROJECT_LOG 2026-04-19. Verify a claim like this against `com.polarion.alm.ui_<ver>/ui.jar` in a real container before deleting a contribution. `plugin.xml` registers the webapp context root `polarion/code-editor`. Class names referenced from `hivemodule.xml` must match real Java classes or Polarion silently fails to load the contribution.
- **`model/RepoFile`** — value object (a repository file + its revision metadata + optional content).

Frontend is a single `src/main/webapp/editor.html` plus bundled Monaco under `resources/lib/monaco-editor/`. Only the **minified** Monaco build ships in the JAR — `dev/`, `esm/`, and `min-maps/` are excluded by the resources config in `pom.xml`. Don't add runtime references to those excluded folders.

## Conventions

- Java 21, tab indentation, `if(...)`/`catch(...)` with no space before the paren (match existing style). **Lombok** is used (e.g. `@RequiredArgsConstructor` on actions) via the annotation processor.
- Logging uses `com.polarion.core.util.logging.Logger` (Polarion's), not `java.util.logging` or `System.out`.
- Binary files (images) must go through `getFileBytes` / raw output streams; text goes through the `StringWriter`/UTF-8 path. Routing images through the string path corrupts them — `CodeEditorServlet.getImageMimeType` decides which path a request takes.
- `provided` scope for everything the Polarion OSGi runtime supplies (platform JARs, gson, log4j, servlet API). Adding a hard runtime dependency means also adding it to the OSGi `Require-Bundle`/`Import-Package` manifest entries in `pom.xml` — otherwise it won't resolve at runtime. Note: `commons-io`/`commons-fileupload` are deliberately **not** dependencies — they're absent as OSGi bundles on Polarion 2606, so a `Require-Bundle` on either leaves the whole plugin unresolved; use `java.io`/`java.nio` built-ins (Java 21) instead (see `CodeEditorService`'s `InputStream.readAllBytes()` usage).
- `// NOSONAR` comments are intentional SonarQube suppressions with a stated reason; keep the reason if you keep the suppression.

## Versioning & release

Version is set in `pom.xml` (`<version>` and the `manifest.version` property, kept in sync — OSGi `Bundle-Version` must not contain `SNAPSHOT`). Releases go through the `maven-release-plugin` (tag format `v@{project.version}`) and `.github/workflows/release.yml`.
