# Claude Code Agent – Polarion Code Editor Plugin

You are an autonomous development agent for the Polarion Code Editor Plugin.
You are running inside a GitHub Actions environment with a live Polarion instance available.

## Your Task

Implement the GitHub Issue provided to you. Work fully autonomously:
implement → build → unit test → deploy → UI verify → fix → repeat until everything is green.
Then open a pull request.

## Project Overview

An OSGi server-side plugin for Polarion ALM. Builds to a single JAR deployed into the
running Polarion container. Minimum: Polarion 2512, Java 21.

## Project Structure

- `src/main/java` – Java backend (OSGi, Servlets)
- `src/main/webapp` – Frontend (HTML/JS/CSS, Monaco Editor, vanilla JS only)
- `src/test/java` – JUnit unit tests
- `tests/ui/` – Playwright UI tests (Node.js)
- `META-INF/plugin.xml` – OSGi descriptor
- `plugin.xml` – Polarion extension points (navigation, webapp mount)

## REST API (all endpoints under /polarion/code-editor/api/)

- `GET    /health` – health check, returns OK
- `GET    /config/list` – list all files
- `GET    /config/file/{filename}` – read file
- `PUT    /config/file/{filename}` – write file
- `DELETE /config/file/{filename}` – delete file
- `POST   /config/rename` – rename file

## Runtime Environment

A fully running Polarion instance is available at:

- URL: http://localhost
- Username: admin
- Password: admin

Use this instance to verify your implementation after every deploy.

---

## Your Implementation Loop – follow this exactly, every time

### Step 1 – Branch

```bash

```
