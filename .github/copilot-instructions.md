# Polarion Copilot Plugin - AI Agent Instructions

## Project Overview

This is a **Polarion ALM Server-Side Plugin** that provides AI capabilities (Copilot) to the Polarion platform.

- **Backend:** Java (Maven, OSGi context).
- **Frontend:** HTML/JS/CSS (mounted as a webapp).
- **Integration:** Exposes APIs via Servlet and injects Velocity context variables.

## Critical Workflows

### Build & Deploy

**DO NOT** attempt to manually copy JARs or restart services via shell commands unless necessary.

1. **Build & Deploy:** Always use the VS User Task: `Polarion: Full Redeploy`.
   - This runs a custom script (`redeploy.sh`) to build the JAR and push it to the running Polarion container.
2. **Monitoring:**
   - Run `Polarion: Live Logs (Docker)` to tail full logs.
   - Run `Polarion: Live Errors ONLY (Docker)` to filter for exceptions.

### Development Pattern

- **Java Changes:** Require a full redeploy (Task) to take effect.
- **Frontend Changes:** May require redeploy if packaged in the JAR.
- **Configuration:** Runtime config is loaded from the `.configuration` folder in the Polarion Repository (not the code repo).

## Architecture & Code Structure

### 1. Backend (`src/main/java`)

- **Package:** `boesger.polarion.copilot` (Note: `hivemodule.xml` may still reference legacy `biz.avasis` packages—verify consistency).
- **Entry Point:** `boesger.polarion.copilot.api.CopilotGenericServlet`
  - Mapped to `/polarion/copilot/api/*` in `web.xml`.
  - Handles authenticated requests using `DoAsFilter`.
- **LLM Service:** `boesger.polarion.copilot.services.CopilotLlmService`
  - Uses `ILlmProvider` interface (OpenAI, Azure, Local).
- **Polarion Integration:**
  - Access platform services via `PlatformContext.getPlatform().lookupService(ISecurityService.class)`.

### 2. Frontend (`src/main/webapp`)

- **Mount Point:** `/polarion/copilot/` (via `plugin.xml`).
- **Key Files:**
  - `editor.html`: Script editor interface.
  - `swagger.html`: API documentation/testing.
  - `resources/`: Contains static assets (CSS, JS, Examples).

### 3. Extension Points (`META-INF/hivemodule.xml`)

- Defines injection into Velocity Context (`macros`).
- Adds items to the Administration interface (Dashboard, Script Editor).
- **Check Point:** Ensure `class` attributes in this file match actual Java class paths.

## Coding Conventions

### Logging

- **Use:** `boesger.polarion.copilot.core.logger.CopilotLogger`.
- **Do not use:** Raw `java.util.logging` or `System.out`.

### Exception Handling

- Catch `ServletException` or `IOException` at the Servlet level.
- Wrap specific Polarion exceptions when exposing them to the frontend.

### LLM Integration

- Add new providers in `boesger.polarion.copilot.services.providers`.
- Implement `ILlmProvider`.

## Common Tasks & "Gotchas"

- **Missing Class:** `CopilotWikiService` referenced in `hivemodule.xml` appears to be missing in the source. Review logic if touching Velocity context injection.
- **Dependencies:** `biz.avasis.polarion.core` is removed/commented out in `pom.xml`. Do not rely on it.
- **Security:** Ensure `ISecurityService` is used to validate users for sensitive operations.
