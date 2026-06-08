import {
  click,
  expectAttribute,
  expectHidden,
  expectText,
  failMock,
  resetMock,
  seedSession,
  selectOption,
  test,
  visit,
} from './toolkit';

const selectOf = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="status-select"]`;
const checkboxOf = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="issue-select"]`;
const expectStatus = (page: import('./toolkit').Page, key: string, name: string) =>
  expectAttribute(page, page.locator(selectOf(key)), 'data-current', name);

test.describe('bulk status change', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
    await visit(page, '/projects/PROJ');
  });

  test('applies a status to every selected issue and persists', async ({ page }) => {
    await click(page, page.locator(checkboxOf('PROJ-1')));
    await click(page, page.locator(checkboxOf('PROJ-2')));
    await expectText(page, page.locator('[data-testid="bulk-count"]'), '2 selected');

    await selectOption(page, page.locator('[data-testid="bulk-status"]'), 'In Progress');
    await click(page, page.locator('[data-testid="bulk-apply"]'));

    await expectStatus(page, 'PROJ-1', 'In Progress');
    await expectStatus(page, 'PROJ-2', 'In Progress');
    await expectText(page, page.locator('[data-testid="toast"]'), '2 issue(s) updated');
    await expectHidden(page, page.locator('[data-testid="bulk-bar"]'));

    await visit(page, '/projects/PROJ');
    await expectStatus(page, 'PROJ-1', 'In Progress');
  });

  test('reports partial failure and rolls back only the failed issue', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/ERR-1/transitions', status: 500 });
    await click(page, page.locator(checkboxOf('PROJ-2')));
    await click(page, page.locator(checkboxOf('ERR-1')));

    await selectOption(page, page.locator('[data-testid="bulk-status"]'), 'In Progress');
    await click(page, page.locator('[data-testid="bulk-apply"]'));

    await expectStatus(page, 'PROJ-2', 'In Progress');
    await expectStatus(page, 'ERR-1', 'To Do');
    await expectText(page, page.locator('[data-testid="toast"]'), '1 updated, 1 failed');
  });
});
