import { expect, type Locator, type Page, test } from '@playwright/test';

/*
 * Network-aware E2E helpers (mirrors the reference project's e2e-toolkit
 * philosophy: no hard timeouts — every wait polls a condition AND waits
 * for the request graph to go quiet). Tests import only from here.
 */

export { expect, type Locator, type Page, test };

const MOCK_BASE = 'http://localhost:4500';

type WaitOptions = {
  readonly settleMs?: number;
  readonly maxMs?: number;
  readonly pollMs?: number;
};

const trackers = new WeakMap<Page, { active: number; lastChange: number }>();

const ensureTracker = (page: Page): { active: number; lastChange: number } => {
  const existing = trackers.get(page);
  if (existing) return existing;
  const tracker = { active: 0, lastChange: Date.now() };
  trackers.set(page, tracker);
  page.on('request', () => {
    tracker.active += 1;
    tracker.lastChange = Date.now();
  });
  const settle = (): void => {
    tracker.active = Math.max(0, tracker.active - 1);
    tracker.lastChange = Date.now();
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  return tracker;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const waitForCondition = async (
  page: Page,
  checker: () => Promise<boolean>,
  options: WaitOptions = {},
): Promise<void> => {
  const { settleMs = 50, maxMs = 10_000, pollMs = 25 } = options;
  const tracker = ensureTracker(page);
  const start = Date.now();
  for (;;) {
    const ok = await checker().catch(() => false);
    const quiet = tracker.active === 0 && Date.now() - tracker.lastChange >= settleMs;
    if (ok && quiet) return;
    if (Date.now() - start > maxMs) {
      throw new Error(`waitForCondition timed out after ${maxMs}ms (in-flight=${tracker.active})`);
    }
    await sleep(pollMs);
  }
};

/* ── Actions ── */

export const visit = async (page: Page, url: string, options?: WaitOptions): Promise<void> => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForCondition(page, async () => true, options);
};

export const click = async (page: Page, locator: Locator, options?: WaitOptions): Promise<void> => {
  await locator.click();
  await waitForCondition(page, async () => true, options);
};

export const fill = async (
  page: Page,
  locator: Locator,
  value: string,
  options?: WaitOptions,
): Promise<void> => {
  await locator.fill(value);
  await waitForCondition(page, async () => true, options);
};

export const selectOption = async (
  page: Page,
  locator: Locator,
  value: string,
  options?: WaitOptions,
): Promise<void> => {
  await locator.selectOption(value);
  await waitForCondition(page, async () => true, options);
};

export const pressKey = async (
  page: Page,
  locator: Locator,
  key: string,
  options?: WaitOptions,
): Promise<void> => {
  await locator.press(key);
  await waitForCondition(page, async () => true, options);
};

/* ── Assertions (poll the condition, then assert) ── */

const safe = (fn: () => Promise<boolean>) => async (): Promise<boolean> => fn().catch(() => false);

export const expectVisible = async (
  page: Page,
  locator: Locator,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(() => locator.first().isVisible()),
    options,
  );
  await expect(locator.first()).toBeVisible();
};

export const expectHidden = async (
  page: Page,
  locator: Locator,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(async () => !(await locator.first().isVisible())),
    options,
  );
  await expect(locator.first()).toBeHidden();
};

export const expectText = async (
  page: Page,
  locator: Locator,
  text: string | RegExp,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(async () => {
      const content = (await locator.first().textContent()) ?? '';
      return typeof text === 'string' ? content.includes(text) : text.test(content);
    }),
    options,
  );
  await expect(locator.first()).toContainText(text);
};

export const expectCount = async (
  page: Page,
  locator: Locator,
  count: number,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(async () => (await locator.count()) === count),
    options,
  );
  await expect(locator).toHaveCount(count);
};

export const expectMinCount = async (
  page: Page,
  locator: Locator,
  min: number,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(async () => (await locator.count()) >= min),
    options,
  );
  expect(await locator.count()).toBeGreaterThanOrEqual(min);
};

export const expectAttribute = async (
  page: Page,
  locator: Locator,
  name: string,
  value: string | RegExp,
  options?: WaitOptions,
): Promise<void> => {
  await waitForCondition(
    page,
    safe(async () => {
      const actual = (await locator.first().getAttribute(name)) ?? '';
      return typeof value === 'string' ? actual === value : value.test(actual);
    }),
    options,
  );
  await expect(locator.first()).toHaveAttribute(name, value);
};

/** Open a status-select (lazy-loads transitions) and pick a target status. */
export const changeStatus = async (
  page: Page,
  select: Locator,
  toLabel: string,
  options?: WaitOptions,
): Promise<void> => {
  await select.focus();
  const option = select.locator(`option[data-to="${toLabel}"]`);
  await waitForCondition(page, async () => (await option.count()) > 0, options);
  const value = await option.getAttribute('value');
  await select.selectOption(value ?? '');
  await waitForCondition(page, async () => true, options);
};

/* ── Mock Jira control + session seeding ── */

export const resetMock = async (page: Page): Promise<void> => {
  await page.request.post(`${MOCK_BASE}/__mock/reset`);
};

export const failMock = async (
  page: Page,
  rule: { method: string; path: string; status: number; body?: string },
): Promise<void> => {
  await page.request.post(`${MOCK_BASE}/__mock/fail`, { data: rule });
};

/** Seed an authenticated session (skips the real OAuth dance). */
export const seedSession = async (page: Page): Promise<void> => {
  await visit(page, '/test/seed-session');
};

/* ── Drag and drop (native HTML5 DnD as used by Pragmatic DnD) ── */

/*
 * Pragmatic drag-and-drop uses the native HTML5 DnD API, which
 * Playwright's high-level `dragTo` does not reliably trigger. Dispatch
 * the native event sequence with a single shared DataTransfer instead.
 */
export const dragTo = async (
  page: Page,
  source: Locator,
  target: Locator,
  options?: WaitOptions,
): Promise<void> => {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragenter', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
  await dataTransfer.dispose();
  await waitForCondition(page, async () => true, options);
};
