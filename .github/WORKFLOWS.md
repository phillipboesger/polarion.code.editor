# GitHub Workflows – polarion.code.editor

This document describes every workflow in this repository: what it does, when it runs, how it is triggered, what secrets it needs, and what it produces.

---

## Table of Contents

1. [ci.yml — CI: Build & Test](#1-ciyml--ci-build--test)
2. [release.yml — Release Pipeline](#2-releaseyml--release-pipeline)
3. [ui-tests.yml — Playwright UI Tests (standalone)](#3-ui-testsyml--playwright-ui-tests-standalone)
4. [Secrets Reference](#4-secrets-reference)

---

## 1. `ci.yml` — CI: Build & Test

**File:** `.github/workflows/ci.yml`

### Purpose

Compiles the Maven project and runs all JUnit unit tests on every push and pull request targeting `main`. Acts as the primary merge gate to prevent broken code from landing on the default branch.

### Trigger

| Event          | Condition            |
| -------------- | -------------------- |
| `push`         | Branch `main`        |
| `pull_request` | Target branch `main` |

### Jobs

| Job    | What it does                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------- |
| `test` | Checks out the code, sets up Java 21 (Temurin), authenticates against GitHub Packages, runs `mvn verify` |

### Outputs

- Green/red check on the commit or PR — required to merge.

### Secrets needed

| Secret           | Purpose                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PACKAGES_TOKEN` | PAT with `read:packages` to download `com.polarion.*` JARs from GitHub Packages. Falls back to `GITHUB_TOKEN` if absent (only works when the registry is in the same org). |

### Notes

- Unit tests are the only tests here. Playwright UI tests are covered by `ui-tests.yml` and `release.yml`.
- Does **not** push or tag anything.

---

## 2. `release.yml` — Release Pipeline

**File:** `.github/workflows/release.yml`

### Purpose

End-to-end release automation: bumps the Maven version, runs the full test suite (unit + UI) as a release gate, builds **both** platform JARs from the single javax source tree (`…<version>.jar` default/2606 and `…<version>-pre2606.jar` legacy/2512), generates a changelog, tags the commit, and publishes a GitHub Release with both JARs attached.

### Trigger

| Event                   | Condition                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `pull_request` (closed) | PR merged into `main` **and** PR carries one of: `release:major`, `release:minor`, `release:patch` |
| `workflow_dispatch`     | Manually, with a `version_type` input (`patch` / `minor` / `major`)                                |

### Jobs (in order)

| Job                    | Depends on                                     | What it does                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare-release`      | —                                              | Determines bump type; reads current version from `pom.xml`; computes the new version and tag. Skips the whole workflow if no release label is present and the trigger is not manual.                                                                  |
| `discover-test-shards` | —                                              | Scans `src/test/java` for `*Test.java` files and builds a 4-shard JSON matrix for parallel execution.                                                                                                                                                 |
| `test-shards`          | `discover-test-shards`                         | Runs the unit tests in 4 parallel shards; publishes per-shard JUnit reports via `dorny/test-reporter`.                                                                                                                                                |
| `ui-tests`             | —                                              | Spins up the Polarion Docker image, deploys the built JAR, waits for Polarion to start (up to 15 min), runs all Playwright tests; uploads HTML report and JUnit XML. `fail-on-error: true` — blocks the release on test failure.                      |
| `build-and-release`    | `prepare-release` + `test-shards` + `ui-tests` | Updates `pom.xml` version, runs one `mvn clean package -DskipTests` that produces both platform JARs, generates the changelog from `git log`, commits the version bump, pushes the new tag, and creates the GitHub Release with both JARs attached. |

### Outputs

- A new Git tag (e.g. `v1.4.2`) and GitHub Release with:
  - Both plugin JARs (`…<version>.jar` for Polarion 2606 / Tomcat 11 — default, `…<version>-pre2606.jar` for Polarion 2512 / Tomcat 9 — legacy)
  - The Playwright JUnit XML attached as a release asset
  - An auto-generated changelog grouped into _New Features_, _Bug Fixes_, and _Other Changes_

### Secrets needed

| Secret           | Purpose                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PACKAGES_TOKEN` | `read:packages` — download Polarion JARs from GitHub Packages                                                                                                                 |
| `RELEASE_TOKEN`  | PAT with `repo` scope — push to protected `main` branch and create the release. Falls back to `GITHUB_TOKEN` (may fail if branch protection is enabled). |

### Setup required

Run the following command once to create the three release labels (already done for this repository):

```bash
gh label create "release:patch" --description "Triggers a patch release (x.y.Z)" --color "0075ca" --repo phillipboesger/polarion.code.editor --force
gh label create "release:minor" --description "Triggers a minor release (x.Y.0)" --color "e4e669" --repo phillipboesger/polarion.code.editor --force
gh label create "release:major" --description "Triggers a major release (X.0.0)" --color "d73a4a" --repo phillipboesger/polarion.code.editor --force
```

---

## 3. `ui-tests.yml` — Playwright UI Tests (standalone)

**File:** `.github/workflows/ui-tests.yml`

### Purpose

Runs the full Playwright end-to-end UI test suite against a live Polarion Docker instance. Provides post-merge feedback for every merge to `main`, regardless of whether a release is being published.

### Trigger

| Event                   | Condition             |
| ----------------------- | --------------------- |
| `pull_request` (closed) | PR merged into `main` |
| `workflow_dispatch`     | Manual                |

### Jobs

| Job        | What it does                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-tests` | Builds the JAR, starts Polarion Docker, waits for startup, runs Playwright, uploads the HTML report and test results, publishes a JUnit summary via `dorny/test-reporter` |

### Outputs

- Playwright HTML report uploaded as artifact `playwright-report` (retained 14 days)
- Test results (screenshots, traces) as artifact `playwright-test-results` (retained 14 days)
- JUnit check run visible in the Actions summary

### Secrets needed

| Secret           | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `PACKAGES_TOKEN` | `read:packages` — Polarion JARs + pull GHCR image |

### Relationship to `release.yml`

`release.yml` contains its own `ui-tests` job that acts as a hard release gate (`fail-on-error: true`, 30-day artifact retention). This standalone workflow runs for **every** merge to `main` — including non-release PRs — providing continuous post-merge feedback. When a **release PR** is merged, both workflows fire; this is intentional: the standalone run provides quick feedback, while the release pipeline's gate controls whether the release is published.

---

## 4. Secrets Reference

| Secret           | Used by                                 | How to create                                                                                              |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PACKAGES_TOKEN` | `ci.yml`, `release.yml`, `ui-tests.yml` | PAT → _Scopes: `read:packages`_. Required only if the Polarion JARs are in a different org than this repo. |
| `RELEASE_TOKEN`  | `release.yml`                           | PAT → _Scopes: `repo`_. Required when `main` is a protected branch (default `GITHUB_TOKEN` cannot push).   |

---

## Cleanup Notes

### GitHub Copilot agentic workflows removed (2026-09-02)

`compile-workflows.yml`, `issue-triage.md`/`.lock.yml`, `daily-doc-updater.md`/`.lock.yml`, `shared/mood.md`, and the unrelated `.github/copilot-instructions.md` were removed. They depended on a GitHub Copilot seat (`COPILOT_GITHUB_TOKEN`) that isn't available for this repository, so every scheduled/triggered run failed. `daily-doc-updater` also targeted a non-existent `docs/` directory even before that. If Copilot access becomes available again, these can be restored from git history (see the commit removing them) and recompiled with `gh aw compile`.

### `create-labels.yml` was removed

This was a one-time setup utility to create the `release:patch/minor/major` labels. The labels are now permanently present on the repository and the workflow is no longer needed. To recreate the labels (e.g. after a fork), run the `gh label create` commands listed in the `release.yml` setup section above.
