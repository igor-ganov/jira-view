import {
  changeStatus,
  click,
  expectAttribute,
  expectHidden,
  expectText,
  expectVisible,
  pressKey,
  resetMock,
  seedSession,
  test,
  visit,
} from './toolkit';

const openOf = (key: string) => `issue-card[data-issue-key="${key}"] [data-testid="issue-open"]`;
const drawerSelect = '[data-testid="issue-drawer"] [data-testid="status-select"]';
const cardSelect = (key: string) =>
  `issue-card[data-issue-key="${key}"] [data-testid="status-select"]`;

test.describe('issue detail drawer', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
    await visit(page, '/projects/PROJ');
  });

  test('opens on card click and shows the issue details', async ({ page }) => {
    await click(page, page.locator(openOf('PROJ-1')));
    await expectVisible(page, page.locator('[data-testid="issue-drawer"]'));
    await expectText(page, page.locator('[data-testid="drawer-summary"]'), 'Set up CI');
    await expectAttribute(page, page.locator(drawerSelect), 'data-current', 'To Do');
    await expectText(page, page.locator('[data-testid="drawer-assignee"]'), 'Alice');
  });

  test('closes via the close button and via Escape', async ({ page }) => {
    await click(page, page.locator(openOf('PROJ-1')));
    await click(page, page.locator('[data-testid="drawer-close"]'));
    await expectHidden(page, page.locator('[data-testid="issue-drawer"]'));

    await click(page, page.locator(openOf('PROJ-2')));
    await pressKey(page, page.locator('[data-testid="drawer-close"]'), 'Escape');
    await expectHidden(page, page.locator('[data-testid="issue-drawer"]'));
  });

  test('changing status in the drawer updates the board', async ({ page }) => {
    await click(page, page.locator(openOf('PROJ-1')));
    await changeStatus(page, page.locator(drawerSelect), 'In Progress');
    await expectAttribute(page, page.locator(drawerSelect), 'data-current', 'In Progress');
    await click(page, page.locator('[data-testid="drawer-close"]'));
    await expectAttribute(page, page.locator(cardSelect('PROJ-1')), 'data-current', 'In Progress');
  });
});
