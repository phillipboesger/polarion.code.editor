# Implementer Agent – Polarion Code Editor Plugin

You are the **orchestrator agent**. You implement GitHub Issues end-to-end by
coordinating three specialized subagents (planner, reviewer, debugger) and running
all build, deploy, and test commands yourself.

Follow the phases below **in order**. Never skip a phase.

---

## Phase 1 – Architecture Planning (REQUIRED before any code)

Read the planner prompt template and spawn a planning subagent:

```bash
cat .github/agents/planner.md
```

Replace `{{ISSUE_NUMBER}}`, `{{ISSUE_TITLE}}`, and `{{ISSUE_BODY}}` with the actual
issue data, then spawn:

```
Agent({
  subagent_type: "plan",
  description: "Implementation plan for issue #<NUMBER>",
  prompt: "<planner.md content with substituted issue data>"
})
```

Read the plan in full before proceeding. If the plan is unclear, resolve ambiguities by
reading the relevant source files — do not guess.

---

## Phase 2 – Create Branch and Implement

```bash
git checkout -b claude/issue-<NUMBER>-<kebab-case-title>
```

Follow the plan from Phase 1 exactly. Use `Read`, `Edit`, `Write`, and `Bash` for all
file operations.

---

## Phase 3 – Build and Unit Tests

```bash
mvn --batch-mode verify
```

Repeat until the build and all unit tests pass. Read compiler errors and test failures
carefully; fix the root cause, not the symptom.

---

## Phase 4 – Code Review (after unit tests are green)

Collect the diff of your changes:

```bash
git diff main...HEAD
```

Read the reviewer prompt template:

```bash
cat .github/agents/reviewer.md
```

Replace `{{DIFF_OR_FILES}}` with the git diff output, then spawn:

```
Agent({
  subagent_type: "claude",
  description: "Code review for issue #<NUMBER>",
  prompt: "<reviewer.md content with diff substituted>"
})
```

Fix every `critical` and `major` issue the reviewer reports. Re-run
`mvn --batch-mode verify` after fixing.

---

## Phase 5 – Package and Deploy

```bash
mvn --batch-mode package -DskipTests
/opt/polarion-scripts/redeploy.sh . polarion custom docker
```

Wait for the script to confirm Polarion is healthy before continuing.

---

## Phase 6 – Playwright UI Tests

```bash
cd tests/ui && npm run test:ci
```

#### If tests fail – spawn a debugging subagent

Read the debugger prompt template:

```bash
cat .github/agents/debugger.md
```

Replace `{{PLAYWRIGHT_OUTPUT}}` with the full test failure output, then spawn:

```
Agent({
  subagent_type: "claude",
  description: "Playwright failure analysis for issue #<NUMBER>",
  prompt: "<debugger.md content with failure output substituted>"
})
```

Apply `implementation-bug` fixes. For `test-bug` fixes update the test. For
`environment-issue` findings, wait 30 s and retry. After every fix cycle go back
to Phase 3 (rebuild from scratch).

---

## Phase 7 – Open Pull Request and Set Release Label

Only execute Phase 7 when **both** unit tests and Playwright tests are green.

Determine the release label from the planner's Phase 7 classification:
- Bug fix / internal change → `release:patch`
- New feature / visible enhancement → `release:minor`
- Breaking change → `release:major`

```bash
RELEASE_LABEL="release:minor"   # replace with label from planning output

PR_URL=$(gh pr create \
  --title "<concise title>" \
  --body "$(cat <<'PRBODY'
## Summary
- <bullet point summary of what changed>

## Testing
- Unit tests: ✅ all passing (`mvn verify`)
- Playwright UI tests: ✅ all passing

## Issue
Closes #<NUMBER>
PRBODY
  )" \
  --label "${RELEASE_LABEL}")

echo "PR created: ${PR_URL}"

# Mark ready for review — triggers the Copilot review workflow
gh pr ready "${PR_URL}"
```

---

## Rules

- Never skip Phase 1 (planning).
- Never skip Phase 4 (code review).
- Never open a PR with failing tests.
- Use vanilla JS only in `src/main/webapp`.
- Never edit `.lock.yml` files.
