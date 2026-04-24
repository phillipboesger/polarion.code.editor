/**
 * Syntax highlighting and auto-formatting tests:
 *  - Language detection: file extension → Monaco language identifier
 *  - Special case: page.xml → velocity (Polarion macro pages)
 *  - Auto-formatting via Shift+Mod+F: JSON, XML, Velocity (#if, #foreach, #set)
 */
import { test, expect, Page } from '@playwright/test';
import { loginAsPolarionAdmin } from '../helpers/auth';
import { openEditor, clickFile, waitForTab, clearEditorStorage } from '../helpers/editor';

const TS = Date.now();

// ── Low-level Monaco helpers ───────────────────────────────────────────────────

/** Returns the language id of the currently active Monaco model, or null. */
async function getActiveLanguage(page: Page): Promise<string | null> {
  return page.evaluate(() => (globalThis as any).editor?.getModel()?.getLanguageId() ?? null);
}

/** Returns the full text content of the currently active Monaco model. */
async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => (globalThis as any).editor?.getModel()?.getValue() ?? '');
}

/**
 * Replaces the entire content of the active Monaco model directly via JS.
 * Equivalent to selecting all and typing, but without keyboard focus requirements.
 */
async function setEditorContent(page: Page, content: string): Promise<void> {
  await page.evaluate((text) => {
    const w = globalThis as any;
    w.editor?.getModel()?.setValue(text);
    w.editor?.focus();
  }, content);
}

/** Focuses the Monaco editor so keyboard shortcuts reach it. */
async function focusEditor(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click();
}

/**
 * Invokes the editor's internal formatCurrentDocument() function directly.
 * This tests the formatter logic without relying on keyboard-focus behaviour.
 */
async function formatViaJs(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = globalThis as any;
    if (typeof w.formatCurrentDocument === 'function') {
      await w.formatCurrentDocument();
    }
  });
  // Small delay to allow synchronous formatters (Velocity) to commit their edit.
  await page.waitForTimeout(200);
}

/**
 * Creates or overwrites a file via the REST API (bypasses the UI dialog).
 * Returns false when the endpoint is unavailable in the current environment.
 */
async function apiCreateFile(page: Page, fileName: string, content = ''): Promise<boolean> {
  const res = await page.request.put(
    `/polarion/code-editor/api/config/file/${encodeURIComponent(fileName)}`,
    { data: content }
  );
  return res.ok();
}

// ── 1. Syntax Highlighting ─────────────────────────────────────────────────────

const LANG_CASES = [
  // Common web & data formats
  { ext: 'json',  lang: 'json'        },
  { ext: 'xml',   lang: 'xml'         },
  { ext: 'xsd',   lang: 'xml'         },  // XSD is treated as XML
  { ext: 'js',    lang: 'javascript'  },
  { ext: 'ts',    lang: 'typescript'  },
  { ext: 'html',  lang: 'html'        },
  { ext: 'css',   lang: 'css'         },
  { ext: 'scss',  lang: 'scss'        },
  { ext: 'yaml',  lang: 'yaml'        },
  { ext: 'yml',   lang: 'yaml'        },  // .yml alias
  { ext: 'md',    lang: 'markdown'    },
  // Backend languages
  { ext: 'py',    lang: 'python'      },
  { ext: 'java',  lang: 'java'        },
  { ext: 'sql',   lang: 'sql'         },
  { ext: 'sh',    lang: 'shell'       },
  // Velocity / Polarion-specific
  { ext: 'vm',    lang: 'velocity'    },
  { ext: 'vtl',   lang: 'velocity'    },
  { ext: 'fhtml', lang: 'velocity'    },
  { ext: 'pagexml', lang: 'velocity'  },  // Polarion macro page special case
] as const;

test.describe('Code Editor – Syntax Highlighting', () => {
  for (const { ext, lang } of LANG_CASES) {
    test(`".${ext}" → Monaco language "${lang}"`, async ({ page }) => {
      await loginAsPolarionAdmin(page);
      await clearEditorStorage(page);

      const file = ext === 'pagexml' ? 'page.xml' : `hl-${Date.now()}.${ext}`;
      const ok = await apiCreateFile(page, file);
      test.skip(!ok, `Cannot create "${file}" – environment may be read-only`);

      await openEditor(page);
      await clickFile(page, file);
      await waitForTab(page, file);

      await expect
        .poll(() => getActiveLanguage(page), { timeout: 5_000 })
        .toBe(lang);
    });
  }
});

// ── 2. Auto Formatting ─────────────────────────────────────────────────────────

test.describe('Code Editor – Auto Formatting (Shift+Mod+F)', () => {

  // ── JSON ────────────────────────────────────────────────────────────────────

  test('JSON: compact one-liner is pretty-printed on format', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-json-${TS}.json`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const compact = '{"z":3,"a":1,"m":2}';
    await setEditorContent(page, compact);
    await page.keyboard.press('ControlOrMeta+Shift+F');

    // Monaco JSON worker formats asynchronously – poll until content changes.
    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(compact);

    const formatted = await getEditorContent(page);
    expect(formatted).toContain('\n');
    expect(formatted).toContain('"z"');
    expect(formatted).toContain('"a"');
  });

  test('JSON: nested object gets multi-level indentation', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-json2-${TS}.json`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const compact = '{"root":{"nested":{"deep":true}}}';
    await setEditorContent(page, compact);
    await page.keyboard.press('ControlOrMeta+Shift+F');

    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(compact);

    const formatted = await getEditorContent(page);
    // Expect at least 5 lines (opening + 3 nesting levels + closing)
    expect(formatted.split('\n').length).toBeGreaterThanOrEqual(5);
    expect(formatted).toContain('"deep"');
  });

  test('JSON: array of objects is formatted with each element on its own line', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-json3-${TS}.json`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const compact = '[{"id":1},{"id":2},{"id":3}]';
    await setEditorContent(page, compact);
    await page.keyboard.press('ControlOrMeta+Shift+F');

    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(compact);

    const formatted = await getEditorContent(page);
    expect(formatted).toContain('\n');
  });

  // ── XML ─────────────────────────────────────────────────────────────────────

  test('XML: one-liner is expanded to indented block', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-xml-${TS}.xml`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const oneLiner = '<root><child>hello</child></root>';
    await setEditorContent(page, oneLiner);
    await page.keyboard.press('ControlOrMeta+Shift+F');

    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(oneLiner);

    const formatted = await getEditorContent(page);
    expect(formatted).toContain('\n');
    expect(formatted).toContain('<child>');
  });

  test('XML: attributes are preserved after formatting', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-xml2-${TS}.xml`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const xml = '<config version="1.0"><entry key="foo" value="bar"/></config>';
    await setEditorContent(page, xml);
    await page.keyboard.press('ControlOrMeta+Shift+F');

    // Wait for format to complete
    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(xml);

    const formatted = await getEditorContent(page);
    expect(formatted).toContain('version="1.0"');
    expect(formatted).toContain('key="foo"');
  });

  // ── Velocity ────────────────────────────────────────────────────────────────

  test('Velocity .vm: #if block content gets 2-space indentation', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vm-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    // Unindented input – formatter should indent the body
    await setEditorContent(page, '#if($x)\ncontent\n#end');
    await formatViaJs(page);

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('  content');

    const result = await getEditorContent(page);
    // #if and #end stay at column 0
    expect(result).toMatch(/^#if/m);
    expect(result).toMatch(/^#end/m);
  });

  test('Velocity .vm: nested #foreach/#if receives stacked 2-space indent', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vm2-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const raw = '#foreach($item in $list)\n#if($item.active)\n$item.name\n#end\n#end';
    await setEditorContent(page, raw);
    await formatViaJs(page);

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('    $item.name'); // 4 spaces = 2 nesting levels

    const result = await getEditorContent(page);
    expect(result).toContain('  #if');          // #if at 1st level (2 spaces)
    expect(result).toContain('  #end');          // closing #end at 1st level
    expect(result).toMatch(/^#foreach/m);        // #foreach at column 0
    expect(result).toMatch(/^#end\s*$/m);        // last #end at column 0
  });

  test('Velocity .vm: #set( … ) normalizes spacing around = sign', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vm3-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    // No spaces around = sign in raw template
    await setEditorContent(page, '#set($var=$value)');
    await formatViaJs(page);

    // Formatter normalises to #set( $var = $value )
    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('#set( $var = $value )');
  });

  test('Velocity .vm: #else/#elseif clauses are kept at same indent as #if', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vm4-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const raw = '#if($a)\nyes\n#elseif($b)\nmaybe\n#else\nno\n#end';
    await setEditorContent(page, raw);
    await formatViaJs(page);

    const result = await getEditorContent(page);
    // #if, #elseif, #else, #end must all start at column 0
    expect(result).toMatch(/^#if/m);
    expect(result).toMatch(/^#elseif/m);
    expect(result).toMatch(/^#else\s*$/m);
    expect(result).toMatch(/^#end/m);
    // bodies of each branch must be indented
    expect(result).toContain('  yes');
    expect(result).toContain('  maybe');
    expect(result).toContain('  no');
  });

  test('Velocity .vm: block comments (#* … *#) are preserved unchanged', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vm5-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    await setEditorContent(page, '#*\n  Block comment\n*#\n$result');
    await formatViaJs(page);

    const result = await getEditorContent(page);
    expect(result).toContain('Block comment');
    expect(result).toContain('$result');
  });

  // ── Velocity: page.xml special case ─────────────────────────────────────────

  test('Velocity: page.xml uses velocity formatter (not XML formatter)', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const ok = await apiCreateFile(page, 'page.xml');
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, 'page.xml');
    await waitForTab(page, 'page.xml');

    // page.xml is treated as velocity regardless of the .xml extension
    await expect
      .poll(() => getActiveLanguage(page), { timeout: 5_000 })
      .toBe('velocity');

    await setEditorContent(page, '#if($x)\ncontent\n#end');
    await formatViaJs(page);

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('  content');
  });

  // ── Velocity: .vtl and .fhtml aliases ────────────────────────────────────────

  test('Velocity .vtl: velocity formatter applies to .vtl extension', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-vtl-${TS}.vtl`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    await setEditorContent(page, '#foreach($x in $list)\n$x\n#end');
    await formatViaJs(page);

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('  $x');
  });

  test('Velocity .fhtml: velocity formatter applies to .fhtml extension', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-fhtml-${TS}.fhtml`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    await setEditorContent(page, '#if($show)\n<p>Hello</p>\n#end');
    await formatViaJs(page);

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('  <p>Hello</p>');
  });

  // ── Keyboard shortcut integration ───────────────────────────────────────────

  test('Shift+Mod+F keyboard shortcut triggers formatting for JSON', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-shortcut-${TS}.json`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    const compact = '{"shortcut":true}';
    await setEditorContent(page, compact);

    // Focus the editor pane so the shortcut reaches the document handler
    await page.locator('#editor-container').click();
    await page.keyboard.press('ControlOrMeta+Shift+F');

    await expect
      .poll(() => getEditorContent(page), { timeout: 8_000 })
      .not.toBe(compact);
  });

  test('Shift+Mod+F keyboard shortcut triggers formatting for Velocity', async ({ page }) => {
    await loginAsPolarionAdmin(page);
    await clearEditorStorage(page);

    const FILE = `fmt-shortcut-vm-${TS}.vm`;
    const ok = await apiCreateFile(page, FILE);
    test.skip(!ok, 'File creation not available');

    await openEditor(page);
    await clickFile(page, FILE);
    await waitForTab(page, FILE);

    await setEditorContent(page, '#if($x)\nbody\n#end');

    await page.locator('#editor-container').click();
    await page.keyboard.press('ControlOrMeta+Shift+F');

    await expect
      .poll(() => getEditorContent(page), { timeout: 5_000 })
      .toContain('  body');
  });

});
