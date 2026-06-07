import {
  click,
  expect,
  expectCount,
  expectText,
  expectVisible,
  failMock,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const cardsIn = (testid: string) => `[data-testid="${testid}"] [data-testid="issue-card"]`;

test.describe('board read views', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
  });

  test('navigates from the project list into a board', async ({ page }) => {
    await visit(page, '/');
    await click(page, page.locator('[data-project-key="PROJ"]'));
    await expect(page).toHaveURL(/\/projects\/PROJ/);
    await expectVisible(page, page.locator('[data-testid="backlog-section"]'));
  });

  test('Scrum board shows backlog and sprints with their issues', async ({ page }) => {
    await visit(page, '/projects/PROJ');
    await expectCount(page, page.locator(cardsIn('backlog-section')), 4);
    const sprint = page.locator('[data-testid="sprint-section"][data-sprint-id="101"]');
    await expectText(page, sprint, 'Sprint 1');
    await expectCount(page, sprint.locator('[data-testid="issue-card"]'), 2);
  });

  test('an empty sprint renders an empty state', async ({ page }) => {
    await visit(page, '/projects/PROJ');
    const future = page.locator('[data-testid="sprint-section"][data-sprint-id="102"]');
    await expectText(page, future.locator('[data-testid="empty"]'), 'No issues');
  });

  test('Kanban board shows all issues as a flat task list', async ({ page }) => {
    await visit(page, '/projects/KAN');
    await expectVisible(page, page.locator('[data-testid="board-section"]'));
    await expectCount(
      page,
      page.locator('[data-testid="board-section"] [data-testid="issue-card"]'),
      4,
    );
  });

  test('a 401 from Jira shows a scope error, not a re-login loop', async ({ page }) => {
    await failMock(page, { method: 'GET', path: '/rest/agile/1.0/board', status: 401 });
    await visit(page, '/projects/PROJ');
    /* A Jira-side 401 (e.g. missing scopes) must surface as an error and
     * keep the user on the board — redirecting would loop forever. */
    await expectText(page, page.locator('[data-testid="board-error"]'), 'scopes');
    await expect(page).toHaveURL(/\/projects\/PROJ/);
  });
});
