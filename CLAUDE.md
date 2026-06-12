# CLAUDE.md – Polarion Code Editor Plugin

This file is the entry point for Claude Code working in this repository. It defines the
project facts, the commands, the conventions, and — most importantly — the **multi-agent
workflow**: every non-trivial task is split across the specialized subagents defined in
`.claude/agents/` (analyze → plan → implement → test → review → document).

---

## Project Overview

A **VS Code-like file editor** built into Polarion ALM as a server-side OSGi plugin.
It uses the Monaco Editor to edit Velocity macros, JSON configs, XML enumerations and
other text files in the Polarion SVN repository. Builds to a single JAR deployed into
the running Polarion container.

- **Minimum supported versions:** Polarion 2512, Java 21
- **Backend:** Java 21, Maven, OSGi (Hivemind module descriptor)
- **Frontend:** Vanilla HTML/JS/CSS + Monaco Editor — **no npm packages, no bundlers**
- **Tests:** JUnit 4 (unit) + Playwright (end-to-end, Node.js)

## Project Structure

| Path | Purpose |
|---|---|
| `src/main/java` | Java backend (OSGi bundles, Servlet endpoints) |
| `src/main/webapp` | Frontend (HTML/JS/CSS, Monaco Editor — vanilla JS only) |
| `src/test/java` | JUnit 4 unit tests |
| `tests/ui/` | Playwright end-to-end tests (Node.js) |
| `META-INF/hivemodule.xml` | OSGi descriptor — service/component registration |
| `plugin.xml` | Polarion extension points (navigation entries, webapp mount) |
| `.claude/agents/` | Subagent definitions for the multi-agent workflow |
| `.github/WORKFLOWS.md` | Documentation of the CI/release pipelines |

## REST API

All endpoints are mounted under `/polarion/code-editor/api/`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check, returns `OK` |
| `GET` | `/config/list` | List all managed files |
| `GET` | `/config/file/{filename}` | Read a file |
| `PUT` | `/config/file/{filename}` | Write a file |
| `DELETE` | `/config/file/{filename}` | Delete a file |
| `POST` | `/config/rename` | Rename a file |

## Commands

```bash
# Build + run all unit tests (primary verification step)
mvn --batch-mode verify

# Build the plugin JAR without tests (for deployment)
mvn --batch-mode package -DskipTests

# Deploy into a running Polarion Docker container (when available)
/opt/polarion-scripts/redeploy.sh . polarion custom docker

# Run Playwright UI tests (requires a running Polarion with the plugin deployed)
cd tests/ui && npm run test:ci
```

- Playwright results and screenshots land in `tests/ui/test-results/`.
- When a live Polarion instance is available it runs at `http://localhost`
  (user: `admin`, password: `admin`).
- Java changes always require a rebuild + redeploy to take effect; frontend files are
  packaged into the JAR, so they need a redeploy too.

---

## Multi-Agent Workflow (MANDATORY for non-trivial tasks)

Claude Code acts as the **orchestrator**. For anything beyond a trivial one-file tweak
(new feature, bug fix, refactoring, issue implementation), split the work across the
subagents in `.claude/agents/` and follow these phases **in order**:

### Phase 1 – Analyze (`analyzer` subagent)

Spawn the `analyzer` to research the codebase: which files, services, endpoints, and
tests are affected, how the existing code works, and what constraints apply. Pass the
task description; receive a concise analysis report. Never start planning from
assumptions — start from the analyzer's findings.

### Phase 2 – Plan (`planner` subagent)

Spawn the `planner` with the task description **and** the analysis report. It returns a
structured implementation plan (architecture decisions, files to modify/create, unit
tests, Playwright tests, edge cases, release classification). Read the plan in full.
If anything is ambiguous, resolve it by reading the source — do not guess.

### Phase 3 – Implement (`implementer` subagent)

Spawn the `implementer` with the plan. It makes the code changes exactly as planned,
following all coding conventions below. For very small changes the orchestrator may
implement directly, but the plan from Phase 2 is still required.

### Phase 4 – Test (`tester` subagent + `debugger` subagent)

Spawn the `tester` to write/extend the unit and Playwright tests from the plan and run
`mvn --batch-mode verify`. If the build or any test fails, spawn the `debugger` with
the full failure output to get a root-cause analysis and a minimal fix — never fix
failures by trial and error. Apply the fix, re-run, repeat until green.

### Phase 5 – Review (`code-reviewer` subagent)

When tests are green, collect the diff (`git diff`) and spawn the `code-reviewer`.
Fix every `critical` and `major` finding, then re-run `mvn --batch-mode verify`.
Never finish a task with unreviewed code.

### Phase 6 – Document (`documenter` subagent)

Spawn the `documenter` with a summary of what changed. It updates `README.md`,
Javadoc, and any other affected documentation so that docs never drift from the code.

### Rules

- Never skip Phase 1 (analyze) or Phase 2 (plan) for non-trivial tasks.
- Never declare a task done with failing tests.
- Never skip Phase 5 (review) when production code changed.
- Spawn independent subagents in parallel where possible (e.g. `analyzer` runs while
  you read the issue; `documenter` can run while you do final verification).
- Relay each subagent's key findings into the next phase — subagents do not share
  context with each other.

---

## Coding Conventions

- **Frontend:** Vanilla JS only in `src/main/webapp` — no npm packages, no bundlers,
  no frameworks.
- **Logging:** Use `com.polarion.core.util.logging.Logger`, never `System.out` or
  `java.util.logging`.
- **Security:** Validate all user input at every servlet boundary; prevent path
  traversal (never use raw filenames in file system calls); use correct HTTP status
  codes (400 bad input, 403 auth failure, 404 missing resource).
- **OSGi:** Always unregister services and close resources in `deactivate()` /
  `stop()`; keep `META-INF/hivemodule.xml` class references in sync with actual Java
  class paths.
- **Polarion services:** Access platform services via
  `PlatformContext.getPlatform().lookupService(...)`.
- **Tests:** Every new or changed execution path gets a unit test; every new
  user-facing behaviour gets a Playwright test.
- **Generated files:** Never edit `.lock.yml` files in `.github/workflows/` — they
  are auto-generated from their `.md` sources by `compile-workflows.yml`.

## Git & Release Conventions

- Branch names: `claude/<short-kebab-description>` (e.g. `claude/issue-42-format-action`).
- Commit messages: imperative, conventional-commit style (`feat: …`, `fix: …`, `chore: …`).
- PRs into `main` carry exactly one release label, taken from the planner's release
  classification:
  - `release:patch` — bug fix or internal change, no new user-facing feature
  - `release:minor` — new feature or visible enhancement (backwards-compatible)
  - `release:major` — breaking API change or removal of existing functionality
- CI (`ci.yml`) and Playwright (`ui-tests.yml`) must be green before merge; merging a
  labelled PR triggers the release pipeline (`release.yml`). See `.github/WORKFLOWS.md`.
