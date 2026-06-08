import {
  changeStatus,
  expectText,
  expectVisible,
  failMock,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const statusOf = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="issue-status"]`;
const selectOf = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="status-select"]`;

test.describe('single status change', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
    await visit(page, '/projects/PROJ');
  });

  test('changes a status optimistically and persists it', async ({ page }) => {
    await expectText(page, page.locator(statusOf('PROJ-1')), 'To Do');
    await changeStatus(page, page.locator(selectOf('PROJ-1')), 'In Progress');
    await expectText(page, page.locator(statusOf('PROJ-1')), 'In Progress');

    await visit(page, '/projects/PROJ');
    await expectText(page, page.locator(statusOf('PROJ-1')), 'In Progress');
  });

  test('rolls back and toasts when Jira returns 500', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/PROJ-2/transitions', status: 500 });
    await changeStatus(page, page.locator(selectOf('PROJ-2')), 'Done');
    await expectVisible(page, page.locator('[data-testid="toast"]'));
    await expectText(page, page.locator(statusOf('PROJ-2')), 'To Do');
  });

  test('shows a scope hint on 403 and rolls back', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/PROJ-3/transitions', status: 403 });
    await changeStatus(page, page.locator(selectOf('PROJ-3')), 'Done');
    await expectText(page, page.locator('[data-testid="toast"]'), 'needs:');
    await expectText(page, page.locator(statusOf('PROJ-3')), 'In Progress');
  });
});
