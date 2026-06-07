import { expectMinCount, expectVisible, resetMock, seedSession, test, visit } from './toolkit';

/*
 * Foundation smoke: exercises the whole harness end-to-end — mock Jira,
 * test session seeding, the server `/api/projects` endpoint, and the Lit
 * projects list rendering. Proves Phase 1 wiring before feature work.
 */
test.describe('harness smoke', () => {
  test.beforeEach(async ({ page }) => {
    await resetMock(page);
    await seedSession(page);
  });

  test('seeded session renders the mock projects with links to their boards', async ({ page }) => {
    await visit(page, '/');
    const links = page.locator('[data-testid="project-link"]');
    await expectMinCount(page, links, 2);
    await expectVisible(page, page.locator('[data-project-key="PROJ"]'));
    await expectVisible(page, page.locator('[data-project-key="KAN"]'));
  });
});
