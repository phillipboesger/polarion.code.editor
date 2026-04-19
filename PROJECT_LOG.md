# Project Log

Most recent entries appear first. Older entries may be moved to PROJECT_LOG_ARCHIVE.md.

---

<!-- entries below -->

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
