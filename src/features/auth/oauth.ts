import {
  ATLASSIAN_AUTH_BASE,
  JIRA_CLIENT_ID,
  JIRA_CLIENT_SECRET,
  JIRA_REDIRECT_URI,
  JIRA_SCOPES,
} from 'astro:env/server';

/*
 * Atlassian OAuth 2.0 (3LO) — authorization-code flow.
 * Docs: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 * The host is configurable (ATLASSIAN_AUTH_BASE) so E2E can target a mock.
 */
const AUTHORIZE_URL = `${ATLASSIAN_AUTH_BASE}/authorize`;
const TOKEN_URL = `${ATLASSIAN_AUTH_BASE}/oauth/token`;

export type OAuthTokens = {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in: number;
  readonly scope: string;
  readonly token_type: string;
};

/**
 * Build the consent-screen URL the user is redirected to. `state` is an
 * unguessable value echoed back to `/auth/callback` for CSRF protection.
 */
export const buildAuthorizeUrl = (state: string): string => {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: JIRA_CLIENT_ID,
    scope: JIRA_SCOPES,
    redirect_uri: JIRA_REDIRECT_URI,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

/** Exchange the authorization `code` for access/refresh tokens (server-side). */
export const exchangeCodeForTokens = async (code: string): Promise<OAuthTokens> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      code,
      redirect_uri: JIRA_REDIRECT_URI,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as OAuthTokens;
};

/** Trade a refresh token for a fresh access token (rotates the refresh token). */
export const refreshTokens = async (refreshToken: string): Promise<OAuthTokens> => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as OAuthTokens;
};
