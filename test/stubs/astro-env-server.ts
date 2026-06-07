/*
 * Vitest stub for the `astro:env/server` virtual module so unit tests can
 * import code that reads typed env without the Astro build pipeline.
 * Wired via `resolve.alias` in vitest.config.ts.
 */
export const JIRA_CLIENT_ID = 'test-client-id';
export const JIRA_CLIENT_SECRET = 'test-client-secret';
export const JIRA_REDIRECT_URI = 'http://localhost:4321/auth/callback';
export const JIRA_SCOPES = 'read:jira-work read:jira-user offline_access';
export const SESSION_SECRET = 'test-session-secret-which-is-long-enough';
export const JIRA_API_BASE = 'https://jira.test';
export const ATLASSIAN_AUTH_BASE = 'https://auth.test';
export const E2E_TEST_MODE = false;
