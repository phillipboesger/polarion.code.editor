---
paths:
  - "tests/ui/**"
  - "src/main/webapp/**"
---
# UI tests (Playwright, separate from Maven)

Live in `tests/ui/` (own `package.json`). They run against a real Polarion Docker container in CI (`.github/workflows/ui-tests.yml`).

```bash
cd tests/ui && npm ci && npx playwright install --with-deps
npm test           # all tests
npm run test:fast  # 1 worker, stop on first failure, line reporter
npm run test:debug # trace on
```
