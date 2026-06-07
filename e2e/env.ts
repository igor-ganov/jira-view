export const APP_PORT = 4327;
export const MOCK_PORT = 4500;

/*
 * Public astro:env vars are inlined at BUILD time — these must be set for
 * both the build (global-setup) and the preview server, identically.
 */
export const E2E_BUILD_ENV: Record<string, string> = {
  E2E_TEST_MODE: 'true',
  JIRA_API_BASE: `http://localhost:${MOCK_PORT}`,
  ATLASSIAN_AUTH_BASE: `http://localhost:${MOCK_PORT}`,
};

/* Full runtime env for `astro preview` (build vars + runtime secrets). */
export const E2E_APP_ENV: Record<string, string> = {
  ...E2E_BUILD_ENV,
  JIRA_CLIENT_ID: 'e2e-client-id',
  JIRA_CLIENT_SECRET: 'e2e-client-secret',
  JIRA_REDIRECT_URI: `http://localhost:${APP_PORT}/auth/callback`,
  SESSION_SECRET: 'e2e-session-secret-which-is-long-enough-1234',
};
