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

  test('Kanban board groups issues into status columns', async ({ page }) => {
    await visit(page, '/projects/KAN');
    await expectCount(page, page.locator('[data-testid="board-column"]'), 3);
    const todo = page.locator('[data-testid="board-column"][data-column-name="To Do"]');
    await expectCount(page, todo.locator('[data-testid="issue-card"]'), 2);
    const inProgress = page.locator('[data-testid="board-column"][data-column-name="In Progress"]');
    await expectCount(page, inProgress.locator('[data-testid="issue-card"]'), 1);
  });

  test('a 401 from Jira bounces the user to re-login', async ({ page }) => {
    await failMock(page, { method: 'GET', path: '/rest/agile/1.0/board', status: 401 });
    await visit(page, '/projects/PROJ');
    await expectVisible(page, page.locator('[data-testid="mock-login"]'));
  });
});
