import {
  dragTo,
  expectAttribute,
  expectVisible,
  failMock,
  pressKey,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const card = (key: string) => `issue-card[data-issue-key="${key}"]`;
const sprintList = (id: number) =>
  `[data-testid="sprint-section"][data-sprint-id="${id}"] [data-drop-container]`;
const backlogCards = '[data-testid="backlog-section"] [data-testid="issue-card"]';
const boardCards = '[data-testid="board-section"] [data-testid="issue-card"]';

test.describe('drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
  });

  test('Kanban list: dragging a task reorders it and persists', async ({ page }) => {
    await visit(page, '/projects/KAN');
    await dragTo(page, page.locator(card('KAN-3')), page.locator(card('KAN-1')));
    await expectAttribute(page, page.locator(boardCards).first(), 'data-issue-key', 'KAN-3');

    await visit(page, '/projects/KAN');
    await expectAttribute(page, page.locator(boardCards).first(), 'data-issue-key', 'KAN-3');
  });

  test('Kanban list: a failed reorder rolls back', async ({ page }) => {
    await failMock(page, { method: 'PUT', path: '/issue/rank', status: 500 });
    await visit(page, '/projects/KAN');
    await dragTo(page, page.locator(card('KAN-3')), page.locator(card('KAN-1')));
    await expectVisible(page, page.locator('[data-testid="toast"]'));
    await expectAttribute(page, page.locator(boardCards).first(), 'data-issue-key', 'KAN-1');
  });

  test('Scrum: dragging a backlog issue into a sprint moves it', async ({ page }) => {
    await visit(page, '/projects/PROJ');
    await dragTo(page, page.locator(card('PROJ-1')), page.locator(sprintList(101)));
    await expectVisible(page, page.locator(`${sprintList(101)} ${card('PROJ-1')}`));

    await visit(page, '/projects/PROJ');
    await expectVisible(page, page.locator(`${sprintList(101)} ${card('PROJ-1')}`));
  });

  test('Scrum: keyboard Alt+ArrowUp reorders within the backlog', async ({ page }) => {
    await visit(page, '/projects/PROJ');
    const firstBefore = await page.locator(backlogCards).first().getAttribute('data-issue-key');
    const secondKey = await page.locator(backlogCards).nth(1).getAttribute('data-issue-key');
    const secondHost = page.locator(`[data-testid="backlog-section"] ${card(secondKey ?? '')}`);
    await secondHost.focus();
    await pressKey(page, secondHost, 'Alt+ArrowUp');
    const firstAfter = await page.locator(backlogCards).first().getAttribute('data-issue-key');
    if (firstAfter !== secondKey) throw new Error(`expected ${secondKey} first, got ${firstAfter}`);
    if (firstAfter === firstBefore) throw new Error('order did not change');
  });
});
