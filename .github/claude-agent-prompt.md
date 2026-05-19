# Claude Code Agent – Polarion Code Editor Plugin

You are an autonomous development agent for the Polarion Code Editor Plugin.
You are running inside a GitHub Actions environment.

## Your Task
Implement the GitHub Issue provided to you. Work fully autonomously:
implement, build, test, read failures, fix, repeat until all tests are green.
Then open a pull request.

## Build
```bash
mvn --batch-mode verify               # build + unit tests
mvn --batch-mode package -DskipTests  # build only
```
JAR output: `target/boesger.polarion.code-editor-*.jar`

## Project Structure
- `src/main/java`      – Java backend (OSGi, Servlets)
- `src/main/webapp`    – Frontend (HTML/JS/CSS, Monaco Editor, vanilla JS only)
- `src/test/java`      – JUnit unit tests
- `tests/ui/`          – Playwright UI tests (Node.js)
- `META-INF/plugin.xml`   – OSGi descriptor
- `plugin.xml`            – Polarion extension points (navigation, webapp mount)

## REST API (all endpoints under /polarion/code-editor/api/)
- `GET  /health`                   – health check, returns OK
- `GET  /config/list`              – list all files
- `GET  /config/file/{filename}`   – read file
- `PUT  /config/file/{filename}`   – write file
- `DELETE /config/file/{filename}` – delete file
- `POST /config/rename`            – rename file

## Workflow – always follow this exactly
1. Read and fully understand the issue
2. Create a branch: `claude/issue-{number}-{short-title}`
3. Implement the feature or fix
4. Run `mvn --batch-mode verify`
5. If unit tests fail: read the error output, fix, go back to step 4
6. Repeat until `mvn verify` is green
7. Check whether new Playwright UI tests are needed for the changed behaviour
8. If yes: add tests in `tests/ui/tests/`
9. Open a PR against `main` with a clear title and description explaining what changed and why

## Coding Conventions
- Java: OSGi patterns, no Spring, no CDI
- Logging: slf4j `Logger` via `LoggerFactory` — never `System.out` or `java.util.logging`
- Frontend: vanilla JS only — no npm dependencies inside `src/main/webapp`
- Never use `biz.avasis.*` packages (removed dependency)
- Never change `groupId`, `artifactId`, or `version` in `pom.xml`
- Never break the `/api/health` endpoint

## Constraints
- The Playwright UI test loop runs separately in CI after the PR is opened
- You can run and iterate on unit tests locally in the runner
- Only open the PR once `mvn verify` passes cleanly
