# Polarion Code Editor

Server-side OSGi plugin for **Polarion ALM**: embeds a Monaco (VS Code) editor into the Administration / User View to browse and edit text and image files in the Polarion SVN repository over a small REST API. Backend Java 21, frontend one static webapp. Supports **Polarion 2512 and 2606, Java 21 only** (no backport, deliberate policy, see README). Two JARs from one javax.servlet source tree: default (no suffix) = 2606 / jakarta.servlet (primary), `-pre2606` = 2512 / javax.servlet (dropped once those installs are retired).

`.github/copilot-instructions.md` is **stale** (describes an unrelated Copilot plugin under `boesger.polarion.copilot`); the real code is `boesger.polarion.codeeditor`. Ignore it.

## Build and test

```bash
mvn clean package                                  # deployable JARs (runs unit tests)
mvn --batch-mode verify                            # what CI runs
mvn clean package -DskipTests
mvn test -Dtest=CodeEditorServiceTest#methodName   # single test (class or class#method)
cd tests/ui && npm ci && npx playwright install --with-deps && npm test   # UI tests, separate
```

- Polarion platform JARs (`com.polarion.*`) are not on Maven Central: they come from the private GitHub Packages mirror `maven.pkg.github.com/phillipboesger/polarion-ootb-plugins`, needing a `github` server entry in `~/.m2/settings.xml` with a PAT with `read:packages`. CI uses secret `PACKAGES_TOKEN`.
- One `mvn package` yields `target/boesger.polarion.code-editor-<version>.jar` (2606) and `...-<version>-pre2606.jar` (2512). Deploy the matching one into `<POLARION_HOME>/polarion/plugins/` and restart Polarion.
- Keep the surefire `--add-opens` `argLine` flags (Mockito reflection on Java 21).

## Hard constraints

- Sources are javax.servlet-only; never hand-write a jakarta variant. Never bump `polarion.version` to 3.26.6 (see `.claude/rules/dual-platform-build.md`).
- Do not delete `hivemodule.xml` contributions on unverified API-removal claims (see `.claude/rules/hivemodule.md`).
- Version lives in `pom.xml` (`<version>` and `manifest.version`, kept in sync; no `SNAPSHOT` in `Bundle-Version`). Releases via `maven-release-plugin` (tag `v@{project.version}`) and `.github/workflows/release.yml`.

## Docs and rules

- `README.md`, `CONTRIBUTING.md`, `.github/WORKFLOWS.md`, `PROJECT_LOG.md`.
- Path-scoped rules in `.claude/rules/`: `java-architecture.md` (`src/main/java/**`, `src/test/java/**`), `dual-platform-build.md` (`pom.xml`, transformer, CI), `hivemodule.md` (`META-INF/**`, `plugin.xml`), `ui-tests.md` (`tests/ui/**`, webapp).
