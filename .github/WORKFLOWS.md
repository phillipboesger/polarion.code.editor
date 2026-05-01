# GitHub Workflows – polarion.code.editor

This document describes every workflow and agentic workflow in this repository: what it does, when it runs, how it is triggered, what secrets it needs, and what it produces.

---

## Table of Contents

1. [ci.yml — CI: Build & Test](#1-ciyml--ci-build--test)
2. [release.yml — Release Pipeline](#2-releaseyml--release-pipeline)
3. [ui-tests.yml — Playwright UI Tests (standalone)](#3-ui-testsyml--playwright-ui-tests-standalone)
4. [compile-workflows.yml — Compile Agentic Workflows](#4-compile-workflowsyml--compile-agentic-workflows)
5. [issue-triage.md — Issue Triage Agent](#5-issue-triagemd--issue-triage-agent)
6. [daily-doc-updater.md — Daily Documentation Updater Agent](#6-daily-doc-updatermd--daily-documentation-updater-agent)
7. [Shared Imports](#7-shared-imports)
8. [Secrets Reference](#8-secrets-reference)

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

End-to-end release automation: bumps the Maven version, runs the full test suite (unit + UI) as a release gate, builds the final JAR, generates a changelog, tags the commit, and publishes a GitHub Release with the JAR attached.

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
| `build-and-release`    | `prepare-release` + `test-shards` + `ui-tests` | Updates `pom.xml` version, builds the JAR (`-DskipTests`), generates the changelog from `git log`, commits the version bump, pushes the new tag, and creates the GitHub Release with the JAR attached. |

### Outputs

- A new Git tag (e.g. `v1.4.2`) and GitHub Release with:
  - The plugin JAR (`target/*.jar`)
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

## 4. `compile-workflows.yml` — Compile Agentic Workflows

### Purpose

Keeps the compiled `.lock.yml` files in sync with their `.md` source files. GitHub's Agentic Workflow runtime executes `.lock.yml` files (not `.md`); this workflow regenerates them automatically using the `gh aw compile` command whenever a source file changes.

### Trigger

| Event               | Condition                                          |
| ------------------- | -------------------------------------------------- |
| `push`              | Any `.md` file changed inside `.github/workflows/` |
| `pull_request`      | Any `.md` file changed inside `.github/workflows/` |
| `workflow_dispatch` | Manual                                             |

### Jobs

| Job       | What it does                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile` | Installs the `gh-aw` CLI extension, runs `gh aw compile`, and auto-commits changed `.lock.yml` files on direct pushes to `main` with a `[skip ci]` commit. |

### Outputs

- Updated `.lock.yml` files committed back to the branch (push events only).
- On pull requests: diff is computed but not committed (lets you review changes before merging).

### Secrets needed

`GITHUB_TOKEN` (automatic — no additional secrets required).

### Setup required

The repository must allow Actions to create pull requests:  
_Settings → Actions → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"_

---

## 5. `issue-triage.md` — Issue Triage Agent

**Files:** `.github/workflows/issue-triage.md` (source) + `.github/workflows/issue-triage.lock.yml` (compiled, do not edit)

### Purpose

An AI agentic workflow (GitHub Copilot) that automatically triages newly opened issues. It reads the issue title and body, assigns a label, and posts an acknowledgement comment — reducing maintainer toil for routine issue intake.

### Trigger

| Event    | Condition                   |
| -------- | --------------------------- |
| `issues` | Types: `opened`, `reopened` |

### What the agent does

1. Classifies the issue as **bug**, **enhancement**, **question**, **documentation**, or **duplicate**.
2. Applies the matching label via the GitHub Issues API.
3. Posts a concise comment (max 5 sentences) that greets the reporter, explains the label choice, and asks for any missing context (e.g. reproduction steps for bugs, missing context for questions).

> The comment is written in **the same language as the issue** (English, German, etc.).

### Secrets needed

| Secret                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `COPILOT_GITHUB_TOKEN` | Required by the `gh-aw` runtime to call the Copilot AI model  |
| `GH_AW_GITHUB_TOKEN`   | GitHub MCP server token for reading/writing issues and labels |

### Notes

- The compiled `.lock.yml` is auto-regenerated by `compile-workflows.yml` whenever `issue-triage.md` is modified. **Never edit the `.lock.yml` directly.**
- Labels must exist on the repository before the agent can apply them. The labels `bug`, `enhancement`, `question`, `documentation`, and `duplicate` are GitHub defaults and exist on every new repository.

---

## 6. `daily-doc-updater.md` — Daily Documentation Updater Agent

**Files:** `.github/workflows/daily-doc-updater.md` (source) + `.github/workflows/daily-doc-updater.lock.yml` (compiled, do not edit)

### Purpose

An AI agentic workflow that scans recently merged pull requests and commits, identifies undocumented changes, and opens a draft PR to update the project documentation. Reduces documentation drift over time.

### Trigger

| Event               | Condition                           |
| ------------------- | ----------------------------------- |
| `schedule`          | Every Friday at ~21:07 UTC (weekly) |
| `workflow_dispatch` | Manual                              |

### What the agent does

1. Searches for PRs merged in the last 24 hours.
2. Analyses changes for new features, removals, and breaking changes.
3. Reads documentation guidelines from `.github/instructions/documentation.instructions.md`.
4. Updates Markdown/MDX files under `docs/` accordingly.
5. Opens a PR labelled `documentation, automation` with `auto-merge: true`.

### Outputs

- A GitHub pull request with documentation updates (if changes are found).

### Secrets needed

| Secret                   | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `COPILOT_GITHUB_TOKEN`   | Copilot AI model access                    |
| `GH_AW_GITHUB_TOKEN`     | GitHub MCP server                          |
| `GH_AW_CI_TRIGGER_TOKEN` | Trigger downstream CI from the agent's PRs |

### Notes

- **This workflow expects a `docs/` directory** (Astro Starlight layout: `docs/src/content/docs/`). If this directory does not exist in the repository the agent will find nothing to update and the run will produce no PR.
- The compiled `.lock.yml` is auto-regenerated by `compile-workflows.yml`. **Never edit it directly.**

---

## 7. Shared Imports

The `shared/` sub-folder contains Markdown files that are imported by agentic workflows via the `imports:` frontmatter directive.

| File                              | Imported by                              | Purpose                                                                                                                        |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `shared/mood.md`                  | `daily-doc-updater.md`                   | Tone/style instructions for the AI agent. Currently a placeholder.                                                             |
| `shared/docs-server-lifecycle.md` | _(not imported by any current workflow)_ | Instructions for starting/stopping an Astro Starlight preview server. Kept for reference if a doc-preview step is added later. |

---

## 8. Secrets Reference

| Secret                   | Used by                                 | How to create                                                                                              |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `PACKAGES_TOKEN`         | `ci.yml`, `release.yml`, `ui-tests.yml` | PAT → _Scopes: `read:packages`_. Required only if the Polarion JARs are in a different org than this repo. |
| `RELEASE_TOKEN`          | `release.yml`                           | PAT → _Scopes: `repo`_. Required when `main` is a protected branch (default `GITHUB_TOKEN` cannot push).   |
| `COPILOT_GITHUB_TOKEN`   | `issue-triage`, `daily-doc-updater`     | Provided by the `gh-aw` runtime — usually a GitHub App token, not a personal PAT.                          |
| `GH_AW_GITHUB_TOKEN`     | `issue-triage`, `daily-doc-updater`     | GitHub App installation token for the MCP server used by agentic workflows.                                |
| `GH_AW_CI_TRIGGER_TOKEN` | `daily-doc-updater`                     | Token allowing the agent to trigger CI on PRs it creates.                                                  |

---

## Cleanup Notes

The following issues were identified during the workflow audit (April 2026):

### `shared/docs-server-lifecycle.md` was removed

This file was not imported by any workflow and has been deleted.

### `create-labels.yml` was removed

This was a one-time setup utility to create the `release:patch/minor/major` labels. The labels are now permanently present on the repository and the workflow is no longer needed. To recreate the labels (e.g. after a fork), run the `gh label create` commands listed in the `release.yml` setup section above.
This file is not imported by any workflow in the repository. It was likely copied from the `gh-aw` template. Remove it or keep it only if a doc-preview step is planned.

### `daily-doc-updater` targets a non-existent `docs/` directory

The agent searches `docs/src/content/docs/` which does not exist in this project. The weekly run will find nothing to do. Either add the docs directory, or disable the workflow until documentation is set up.
