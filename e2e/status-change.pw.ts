import {
  changeStatus,
  expectAttribute,
  expectText,
  expectVisible,
  failMock,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const selectOf = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="status-select"]`;
const expectStatus = (page: import('./toolkit').Page, key: string, name: string) =>
  expectAttribute(page, page.locator(selectOf(key)), 'data-current', name);

test.describe('single status change', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
    await visit(page, '/projects/PROJ');
  });

  test('changes a status optimistically and persists it', async ({ page }) => {
    await expectStatus(page, 'PROJ-1', 'To Do');
    await changeStatus(page, page.locator(selectOf('PROJ-1')), 'In Progress');
    await expectStatus(page, 'PROJ-1', 'In Progress');

    await visit(page, '/projects/PROJ');
    await expectStatus(page, 'PROJ-1', 'In Progress');
  });

  test('rolls back and toasts when Jira returns 500', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/PROJ-2/transitions', status: 500 });
    await changeStatus(page, page.locator(selectOf('PROJ-2')), 'Done');
    await expectVisible(page, page.locator('[data-testid="toast"]'));
    await expectStatus(page, 'PROJ-2', 'To Do');
  });

  test('shows a scope hint on 403 and rolls back', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/PROJ-3/transitions', status: 403 });
    await changeStatus(page, page.locator(selectOf('PROJ-3')), 'Done');
    await expectText(page, page.locator('[data-testid="toast"]'), 'needs:');
    await expectStatus(page, 'PROJ-3', 'In Progress');
  });
});
