# Project Log

Most recent entries appear first. Older entries may be moved to PROJECT_LOG_ARCHIVE.md.

---

<!-- entries below -->

## 2026-06-15 — Dual-platform build (Polarion 2512 + 2606) and own dependency mirror

**Branch**: claude/optimistic-carson-0i3h2b
**What was done**: Switched the Polarion platform dependency source from the Avasis GitHub Packages registry to our own private mirror (`phillipboesger/polarion-ootb-plugins`) and added Polarion 2606 support alongside 2512. Polarion 2606 upgraded Tomcat 9 → Tomcat 11 (Jakarta EE 11), moving the Servlet API from `javax.servlet` to `jakarta.servlet`, which is binary-incompatible with 2512. The project now produces **two JARs from one source tree** via Maven profiles.
**Changed files**:
- `pom.xml` — repository URL → `phillipboesger/polarion-ootb-plugins`; removed the base `javax.servlet-api` dependency; added `polarion-2512` (default, javax) and `polarion-2606` (jakarta, Servlet 6.1) profiles; per-profile servlet source root (build-helper `add-source`), servlet API, `web.xml`, and `-polarion2512`/`-polarion2606` finalName suffix; documented the 2606 = 3.26.6 / 5.26.6 bundle versions.
- `src/main/java-javax/.../CodeEditorServlet.java` — moved here from `src/main/java` (javax variant).
- `src/main/java-jakarta/.../CodeEditorServlet.java` — new jakarta twin (identical except namespace).
- `src/main/webapp-jakarta/WEB-INF/web.xml` — new Jakarta EE 11 / Servlet 6.1 descriptor; base `web.xml` annotated as the javax twin and excluded from the base resource so each profile supplies its own.
- `src/test/java/.../CodeEditorServletVariantParityTest.java` — fails the build if the two servlet variants diverge by anything other than the namespace prefix.
- `.github/workflows/{ci,ui-tests,release}.yml` — CI now builds both variants; UI tests deploy the `polarion2606` JAR because the `polarion-docker:latest` image is Polarion 2606/Jakarta (it aborts startup on a javax extension: "Extensions that are not Jakarta compatible were found. The Startup cannot continue."); release publishes both JARs.
- `README.md`, `CONTRIBUTING.md`, `.github/claude-agent-prompt.md`, `.github/ISSUE_TEMPLATE/bug_report.yml` — documented dual support, install-the-matching-JAR guidance, and a JAR-variant field in the bug template.
**New knowledge**:
- The OOTB mirror's Maven coordinates are NOT identical to Avasis. groupId is always `com.polarion`; artifactId = Bundle-SymbolicName minus `com.polarion.`; version = Bundle-Version. Crucially, Polarion bundles are *exploded* (multiple embedded jars): the publisher emits the bundle wrapper as `com.polarion:<bundle>` and each embedded jar as `com.polarion:<bundle>.<embedded-jar>`. So classes the code uses live in those extras, e.g. `com.polarion.platform.persistence.UnresolvableObjectException` → `com.polarion:platform.persistence.platform-persistence`, and `com.polarion.subterra.base.data.identification.IContextId` → `com.polarion:subterra.base.subterra-base-data`. Avasis had instead repackaged subterra as synthetic `subterra.base.data`/`subterra.base.core` artifacts that do not exist in our mirror.
- To find which artifact carries a class, query `…/users/phillipboesger/packages?package_type=maven` for the names, then `curl -fsSL -H "Authorization: Bearer <PACKAGES_TOKEN>"` the candidate jar (GitHub Packages 302-redirects jar downloads to blob storage — `-L` is required) and `unzip -l | grep`.
- `CodeEditorServlet` is the *only* main file coupled to the servlet namespace; `PolarionUtils` uses Polarion's own `ITransactionService` (not `javax.transaction`) and no code uses commons-fileupload. The migration surface is exactly one Java file + `web.xml`.
- Both variants compile against the stable 3.25.12 platform API. OSGi `Require-Bundle` versions are minimum floors, so the 2606 JAR resolves against the higher 3.26.6 bundles at runtime; only the Servlet API (javax↔jakarta) and `web.xml` differ. Override `-Dpolarion.version=3.26.6 -Dsubterra.version=5.26.6` to compile natively against 2606 JARs once they are published in the mirror.
- Build commands: `mvn clean package` (2512, default, runs tests + parity check) and `mvn clean package -Ppolarion-2606` (2606, jakarta; tests skipped by the profile).
**Open / Next steps**:
- Verify on a real Polarion 2606 install that the `com.polarion.portal.tomcat` bundle still exports `DoAsFilter` under the same FQN and that every `Require-Bundle` entry resolves (the unused `org.apache.commons.commons-fileupload` bundle was deliberately left in the manifest; drop it from the 2606 manifest if Tomcat 11/Jakarta renamed it).
- The 2606 OOTB bundles ARE already in the mirror (platform `3.26.6`, subterra `5.26.6`), so the 2606 profile could optionally be switched to compile natively against them (`-Dpolarion.version=3.26.6 -Dsubterra.version=5.26.6`) instead of the stable 3.25.12 API.

---

## 2026-04-19 — Release workflow now gates build on parallel test shards

**Branch**: main
**What was done**: Reworked the GitHub Release workflow into staged jobs so that all tests run first in parallel shards, publish readable JUnit results in GitHub checks, and only then trigger build/tag/release steps.
**Changed files**:
- `.github/workflows/release.yml` — split into `prepare-release`, `discover-test-shards`, `test-shards`, and `build-and-release`; added shard-based Maven test execution and test-report publication.
- `PROJECT_LOG.md` — documented the new release quality gate and reporting behavior.
**New knowledge**:
- Parallel test execution can be generated dynamically by discovering `*Test.java` files and distributing FQCNs into shard matrix entries.
- `dorny/test-reporter` with Surefire XML gives an easy-to-scan GitHub Checks view per shard, while `actions/upload-artifact` keeps raw reports downloadable.
- Using `needs: [prepare-release, test-shards]` ensures release build/publish cannot run before all shards pass.
**Open / Next steps**:
- Optional: mirror the same shard strategy in `.github/workflows/ci.yml` to align push/PR feedback with release validation.

---

## 2026-04-19 — Polarion startup duplicate bundle diagnosis

**Branch**: main
**What was done**: Verified that no `codeeditor.read`/`codeeditor.write` permission definitions remain in source, then traced startup failures to a stale legacy plugin bundle loaded outside `custom` extensions.
**Changed files**:
- `PROJECT_LOG.md` — documented root cause and remediation.
**New knowledge**:
- Startup FATALs were caused by duplicate module loading (`boesger.polarion.codeeditor.polarion-code-editor` + `boesger.polarion.code-editor`), not by permission handling in current code.
- Keeping only the current bundle under `/opt/polarion/polarion/extensions/custom/eclipse/plugins` and restarting via `polarionctl.sh stop/start` restores clean startup.
**Open / Next steps**:
- None for permissions; if duplicate startup errors reappear, check `/opt/polarion/polarion/extensions/boesger/eclipse/plugins` first.

---

## 2026-04-19 — Sonar cleanup in CodeEditorServlet

**Branch**: main
**What was done**: Removed unused permission-related fields and dead helper logic from the servlet initialization to resolve Sonar/code-quality findings without changing endpoint behavior.
**Changed files**:
- `src/main/java/boesger/polarion/codeeditor/api/CodeEditorServlet.java` — removed unused `IPermission` fields and related initialization/helper method.
**New knowledge**:
- Workflow lock-file warnings (`Context access might be invalid`) are from GitHub Actions expression validation and should not be treated as Java Sonar findings.
- Generated `*.lock.yml` files should be handled with their generator workflow rather than broad manual rewrites.
**Open / Next steps**:
- If required, regenerate/update GitHub AW lock workflows with tooling that matches the current expression validator rules.

---
