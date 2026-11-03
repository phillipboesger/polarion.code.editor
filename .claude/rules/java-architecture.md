---
paths:
  - "src/main/java/**"
  - "src/test/java/**"
---
# Java architecture and conventions

Request flow: **browser (Monaco in `editor.html`) → `CodeEditorServlet` (REST) → `CodeEditorService` → Polarion repository API**.

- **`api/CodeEditorServlet`**: the only HTTP entry point, mapped to `/polarion/code-editor/api/*` (see `web.xml`). Routes GET/PUT/DELETE/POST by `pathInfo`, does Gson (de)serialization, and gates every request behind `securityService.getCurrentUser() != null` (401 otherwise). Endpoints: `/health`, `/config/list`, `/config/file/{name}` (GET read/download, PUT save, DELETE), `/files/tree`, `/config/rename` (POST). A `projectId` query param scopes an operation to a project; omitting it means global/admin scope.
- **`service/CodeEditorService`**: all repository logic. Constructed per-request with a `projectId`. Reads go through a read-only connection; **every write goes through a `service/action/*` command** (`SaveFileAction`, `DeleteFileAction`, `RenameFileAction`, `CopyFileAction`) run inside `PolarionUtils.executeInTransactionWithResult(...)`. New mutating operation: a small `RunnableWEx<T>` action wrapped in a transaction; never call the write connection directly from servlet or service.
- **Scope resolution**: a file name resolves to an `ILocation` via `getFileRepoLocation`: prefers the **project** location when a `projectId` is set and the file exists there, else falls back to the **global** repo root. `getFiles` merges project + global files and de-duplicates so project files shadow globals. Keep this project-then-global precedence in any path handling.
- **`util/PolarionUtils`**: static holder for the looked-up Polarion services (`ITrackerService`, `ITransactionService`, `IRepositoryService`) plus the transaction helper. Package-private `setXxxService` setters exist **only so tests can inject Mockito doubles**; never use them in production code.
- **`model/RepoFile`**: value object (repository file + revision metadata + optional content).
- Frontend is a single `src/main/webapp/editor.html` plus bundled Monaco under `resources/lib/monaco-editor/`. Only the **minified** Monaco build ships in the JAR (`dev/`, `esm/`, `min-maps/` are excluded in `pom.xml`); don't add runtime references to those folders.

## Conventions

- Java 21, tab indentation, `if(...)`/`catch(...)` with no space before the paren (match existing style). **Lombok** via annotation processor (e.g. `@RequiredArgsConstructor` on actions).
- Logging uses `com.polarion.core.util.logging.Logger`, not `java.util.logging` or `System.out`.
- Binary files (images) go through `getFileBytes` / raw output streams; text through the `StringWriter`/UTF-8 path. Routing images through the string path corrupts them; `CodeEditorServlet.getImageMimeType` decides which path a request takes.
- `provided` scope for everything the Polarion OSGi runtime supplies (platform JARs, gson, log4j, servlet API). A hard runtime dependency also needs `Require-Bundle`/`Import-Package` entries in the `pom.xml` OSGi manifest, otherwise it won't resolve at runtime. `commons-io`/`commons-fileupload` are deliberately **not** dependencies (absent as OSGi bundles on Polarion 2606; a `Require-Bundle` on either leaves the whole plugin unresolved): use `java.io`/`java.nio` built-ins (see `CodeEditorService`'s `InputStream.readAllBytes()`).
- `// NOSONAR` comments are intentional SonarQube suppressions with a stated reason; keep the reason if you keep the suppression.
