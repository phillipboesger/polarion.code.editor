# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/ui/tests/editor-page.spec.ts >> Code Editor – Page Load & Empty State >> sidebar is visible and has "EXPLORER" header
- Location: tests/ui/tests/editor-page.spec.ts:28:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

# Page snapshot

```yaml
- heading "HTTP Status 404 – Not Found" [level=1] [ref=e2]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { loginAsPolarionAdmin } from '../helpers/auth';
  3  | import { openEditor, EDITOR_URL } from '../helpers/editor';
  4  | 
  5  | test.describe('Code Editor – Page Load & Empty State', () => {
  6  | 
> 7  |   test.beforeEach(async ({ page }) => {
     |        ^ Test timeout of 30000ms exceeded while running "beforeEach" hook.
  8  |     await loginAsPolarionAdmin(page);
  9  |   });
  10 | 
  11 |   test('editor.html loads without JS errors', async ({ page }) => {
  12 |     const jsErrors: string[] = [];
  13 |     page.on('pageerror', err => jsErrors.push(err.message));
  14 | 
  15 |     await openEditor(page);
  16 | 
  17 |     // Global boot loader must be gone
  18 |     await expect(page.locator('#globalBootLoader')).not.toHaveClass(/visible/, { timeout: 10_000 });
  19 |     // App container must NOT still be blurred
  20 |     await expect(page.locator('#app-container')).not.toHaveClass(/bootstrap-loading/);
  21 | 
  22 |     expect(jsErrors.filter(e =>
  23 |       // ignore known non-critical third-party noise
  24 |       !e.includes('ResizeObserver') && !e.includes('favicon')
  25 |     )).toHaveLength(0);
  26 |   });
  27 | 
  28 |   test('sidebar is visible and has "EXPLORER" header', async ({ page }) => {
  29 |     await openEditor(page);
  30 |     await expect(page.locator('#sidebar')).toBeVisible();
  31 |     await expect(page.locator('.sidebar-title')).toContainText('EXPLORER');
  32 |   });
  33 | 
  34 |   test('"New File" button is present in sidebar header', async ({ page }) => {
  35 |     await openEditor(page);
  36 |     await expect(page.locator('#newBtn')).toBeVisible();
  37 |     await expect(page.locator('#newBtn')).toBeEnabled();
  38 |   });
  39 | 
  40 |   test('empty state overlay shown when no file is selected', async ({ page }) => {
  41 |     // Open editor with a fresh storage context so no tabs are restored
  42 |     await page.context().clearCookies();
  43 |     await loginAsPolarionAdmin(page);
  44 |     await page.evaluate(() => localStorage.clear());
  45 |     await openEditor(page);
  46 | 
  47 |     await expect(page.locator('#emptyState')).toBeVisible();
  48 |     await expect(page.locator('#emptyState')).toContainText('No File Selected');
  49 |   });
  50 | 
  51 |   test('save button is disabled when no file is selected', async ({ page }) => {
  52 |     await openEditor(page);
  53 |     await expect(page.locator('#saveBtn')).toBeDisabled();
  54 |   });
  55 | 
  56 |   test('toolbar shows "No File Selected" label when no file open', async ({ page }) => {
  57 |     await page.evaluate(() => localStorage.clear());
  58 |     await openEditor(page);
  59 |     await expect(page.locator('#currentFileLabel')).toContainText('No File Selected');
  60 |   });
  61 | 
  62 |   test('editor page title is "File Editor"', async ({ page }) => {
  63 |     await page.goto(EDITOR_URL);
  64 |     await expect(page).toHaveTitle('File Editor');
  65 |   });
  66 | 
  67 | });
  68 | 
```