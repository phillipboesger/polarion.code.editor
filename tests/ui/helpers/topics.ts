/**
 * Helpers for Polarion's Portal Topics configuration.
 *
 * The Code Editor contributes a User View sidebar entry via the
 * `com.polarion.xray.webui.customNavigationExtenders` contribution in
 * META-INF/hivemodule.xml (CodeEditorNavigationExtender). That entry only
 * renders once its topic id is listed in the active Topics config, which is
 * exactly what README.md's "Navigation Tab in User View" section documents:
 *
 *     <topic id="code-editor"/>
 *
 * The config is a repository file, so these helpers read and write it through
 * the plugin's own REST API (the same endpoints helpers/editor.ts uses) rather
 * than driving Polarion's GWT Topics admin page.
 *
 * IMPORTANT (playwright.config.ts runs workers: 1): this file is GLOBAL config
 * shared by every spec in the run. Always pair enableCodeEditorTopic() with the
 * restore callback it returns, so a later spec never inherits a mutated
 * navigation.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Repository path of the global (repository-scope) Topics configuration. */
export const TOPICS_PATH = '.polarion/hats/_default/portal/topics.xml';

/** Topic id contributed by CodeEditorNavigationExtender.getId(). */
export const CODE_EDITOR_TOPIC_ID = 'code-editor';

/**
 * Polarion's stock topic list, taken from the shipped project templates
 * (com.polarion.alm.projects_<ver>/templates/*\/.polarion/hats/_default/portal/topics.xml).
 *
 * Used only when no topics.xml exists yet: writing a file containing just the
 * Code Editor topic would REMOVE every standard entry from the navigation for
 * the rest of the run.
 */
const DEFAULT_TOPIC_IDS = [
  'workitems',
  'wiki',
  'plans',
  'testruns',
  'collections',
  'baselines',
  'builds',
  'reports',
  'monitor',
  'global_shortcuts',
  'project_shortcuts',
  'user_shortcuts',
] as const;

/**
 * Builds the REST URL for a repository file.
 *
 * Encodes each path SEGMENT separately instead of the whole path: a single
 * encodeURIComponent() over a nested path turns its "/" into "%2F", and Tomcat
 * rejects encoded slashes in a URL path by default, so the request never
 * reaches the servlet and comes back 404. (helpers/editor.ts gets away with
 * encodeURIComponent because the files it touches are flat names.)
 */
function apiUrl(fileName: string): string {
  const encodedPath = fileName.split('/').map(encodeURIComponent).join('/');
  return `/polarion/code-editor/api/config/file/${encodedPath}`;
}

function renderTopics(topicIds: readonly string[]): string {
  const entries = topicIds.map((id) => `    <topic id="${id}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<topics xmlns="http://polarion.com/schema/Portal/Topics" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://polarion.com/schema/Portal/Topics">
${entries}
</topics>
`;
}

/** Reads the global topics.xml, or returns null when it does not exist yet. */
export async function readTopics(page: Page): Promise<string | null> {
  const response = await page.request.get(apiUrl(TOPICS_PATH));
  if (!response.ok()) {
    return null;
  }
  return response.text();
}

/**
 * Writes the global topics.xml. Asserts the write succeeded — a silently
 * swallowed failure here would surface later as a confusing "navigation entry
 * missing" assertion in the spec, which is the wrong place to debug it.
 */
export async function writeTopics(page: Page, xml: string): Promise<void> {
  const response = await page.request.put(apiUrl(TOPICS_PATH), { data: xml });
  expect(
    response.ok(),
    `PUT ${TOPICS_PATH} failed with status ${response.status()} — cannot set up the Topics config`,
  ).toBeTruthy();
}

/** Best-effort deletion of the global topics.xml (used to restore "no file existed"). */
export async function deleteTopics(page: Page): Promise<void> {
  await page.request.delete(apiUrl(TOPICS_PATH)).catch(() => {/* best-effort */});
}

/**
 * Ensures `<topic id="code-editor"/>` is present in the global Topics config.
 *
 * Returns a restore callback that puts the configuration back exactly as it
 * was — the previous file content, or deletion when there was no file before.
 * Call it in afterAll (see the workers: 1 note at the top of this file).
 */
export async function enableCodeEditorTopic(page: Page): Promise<() => Promise<void>> {
  const original = await readTopics(page);

  if (original?.includes(`id="${CODE_EDITOR_TOPIC_ID}"`)) {
    // Already enabled — nothing to change, nothing to restore.
    return async () => {/* no-op */};
  }

  if (original === null) {
    await writeTopics(page, renderTopics([...DEFAULT_TOPIC_IDS, CODE_EDITOR_TOPIC_ID]));
    return async () => { await deleteTopics(page); };
  }

  // Insert the topic before the closing tag, preserving whatever else is there.
  const patched = original.replace(
    /<\/topics>/,
    `    <topic id="${CODE_EDITOR_TOPIC_ID}"/>\n</topics>`,
  );
  expect(
    patched,
    `Existing ${TOPICS_PATH} has no </topics> closing tag — cannot enable the topic`,
  ).not.toEqual(original);

  await writeTopics(page, patched);
  return async () => { await writeTopics(page, original); };
}
