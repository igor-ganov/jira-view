import {
  dragTo,
  expectText,
  expectVisible,
  failMock,
  pressKey,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const card = (key: string) => `issue-card[data-issue-key="${key}"]`;
const columnList = (name: string) =>
  `[data-testid="board-column"][data-column-name="${name}"] [data-drop-container]`;
const sprintList = (id: number) =>
  `[data-testid="sprint-section"][data-sprint-id="${id}"] [data-drop-container]`;
const backlogCards = '[data-testid="backlog-section"] [data-testid="issue-card"]';

test.describe('drag and drop', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
  });

  test('Kanban: dragging a card to another column changes its status', async ({ page }) => {
    await visit(page, '/projects/KAN');
    await dragTo(page, page.locator(card('KAN-1')), page.locator(columnList('In Progress')));
    const moved = page.locator(`[data-column-name="In Progress"] ${card('KAN-1')}`);
    await expectVisible(page, moved);
    await expectText(
      page,
      page.locator(`${card('KAN-1')} [data-testid="issue-status"]`),
      'In Progress',
    );

    await visit(page, '/projects/KAN');
    await expectVisible(page, page.locator(`[data-column-name="In Progress"] ${card('KAN-1')}`));
  });

  test('Kanban: a failed move rolls the card back to its column', async ({ page }) => {
    await failMock(page, { method: 'POST', path: '/issue/KAN-1/transitions', status: 500 });
    await visit(page, '/projects/KAN');
    await dragTo(page, page.locator(card('KAN-1')), page.locator(columnList('Done')));
    await expectVisible(page, page.locator('[data-testid="toast"]'));
    await expectVisible(page, page.locator(`[data-column-name="To Do"] ${card('KAN-1')}`));
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
