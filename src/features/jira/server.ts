import type { AstroSession } from 'astro';
import { refreshTokens } from '@/features/auth/oauth';
import { SESSION_TOKENS_KEY, type StoredTokens, toStoredTokens } from '@/features/auth/session';
import { getAccessibleResources, JiraApiError } from './client';

/*
 * Server-side glue shared by every `/api/*` endpoint: keep the access
 * token fresh, resolve (and cache) the cloudId, and translate Jira/network
 * failures into proper HTTP responses with a stable JSON error shape.
 */

const SESSION_CLOUD_ID_KEY = 'jiraCloudId';

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type JiraContext = { readonly accessToken: string; readonly cloudId: string };

/** A still-valid access token, refreshing transparently when near expiry. */
const ensureFreshTokens = async (
  session: AstroSession,
  tokens: StoredTokens,
): Promise<StoredTokens> => {
  const expiringSoon = tokens.expiresAt - Date.now() < 60_000;
  if (!expiringSoon || !tokens.refreshToken) return tokens;
  const next = toStoredTokens(await refreshTokens(tokens.refreshToken));
  session.set(SESSION_TOKENS_KEY, next);
  return next;
};

/**
 * Resolve the authenticated Jira context, or a ready-to-return error
 * Response (401 when unauthenticated, 404 when the token reaches no site).
 */
export const resolveJiraContext = async (
  session: AstroSession | undefined,
): Promise<JiraContext | { readonly error: Response }> => {
  const stored = await session?.get(SESSION_TOKENS_KEY);
  if (!session || !stored) return { error: jsonResponse({ error: 'unauthenticated' }, 401) };

  const tokens = await ensureFreshTokens(session, stored);

  const cached = await session.get(SESSION_CLOUD_ID_KEY);
  if (cached) return { accessToken: tokens.accessToken, cloudId: cached };

  const resources = await getAccessibleResources(tokens.accessToken);
  const site = resources[0];
  if (!site) return { error: jsonResponse({ error: 'no-accessible-jira-site' }, 404) };
  session.set(SESSION_CLOUD_ID_KEY, site.id);
  return { accessToken: tokens.accessToken, cloudId: site.id };
};

/*
 * Documented OAuth scopes per endpoint pattern (matched against the request
 * path). Lets the UI name the EXACT scopes a failing call needs instead of
 * guessing. Source: developer.atlassian.com Jira / Jira Software REST docs.
 */
const SCOPE_RULES: readonly { readonly test: RegExp; readonly scopes: readonly string[] }[] = [
  {
    test: /\/rest\/agile\/1\.0\/board\/\d+\/backlog/,
    scopes: ['read:board-scope:jira-software', 'read:issue-details:jira', 'read:project:jira'],
  },
  {
    test: /\/rest\/agile\/1\.0\/board\/\d+\/sprint/,
    scopes: ['read:sprint:jira-software', 'read:board-scope:jira-software'],
  },
  {
    test: /\/rest\/agile\/1\.0\/board\/\d+\/issue/,
    scopes: ['read:board-scope:jira-software', 'read:issue-details:jira', 'read:project:jira'],
  },
  {
    test: /\/rest\/agile\/1\.0\/board\/\d+\/configuration/,
    scopes: ['read:board-scope.admin:jira-software'],
  },
  {
    test: /\/rest\/agile\/1\.0\/board(\?|$)/,
    scopes: ['read:board-scope:jira-software', 'read:project:jira'],
  },
  {
    test: /\/rest\/agile\/1\.0\/sprint\/\d+\/issue/,
    scopes: ['read:sprint:jira-software', 'read:issue-details:jira', 'write:sprint:jira-software'],
  },
  { test: /\/rest\/agile\/1\.0\/backlog\/issue/, scopes: ['write:board-scope:jira-software'] },
  {
    test: /\/rest\/agile\/1\.0\/issue\/rank/,
    scopes: ['write:board-scope:jira-software', 'write:sprint:jira-software'],
  },
  {
    test: /\/rest\/api\/3\/issue\/[^/]+\/transitions/,
    scopes: ['read:jira-work', 'write:jira-work'],
  },
  { test: /\/rest\/api\/3\/issue\//, scopes: ['read:jira-work', 'read:issue-details:jira'] },
  { test: /\/rest\/api\/3\/project\/search/, scopes: ['read:jira-work', 'read:project:jira'] },
];

const requiredScopesFor = (path: string): readonly string[] =>
  SCOPE_RULES.find((rule) => rule.test.test(path))?.scopes ?? [];

/** Map a thrown error to a JSON Response with the appropriate HTTP status. */
export const toErrorResponse = (cause: unknown): Response => {
  if (cause instanceof JiraApiError) {
    console.error('[jira-error]', cause.status, cause.path, cause.scopeHint, cause.body);
    const code =
      cause.status === 401
        ? 'jira-unauthorized'
        : cause.status === 403
          ? 'jira-forbidden'
          : cause.status === 409
            ? 'jira-conflict'
            : 'jira-error';
    const httpStatus = cause.status >= 500 ? 502 : cause.status;
    return jsonResponse(
      {
        error: code,
        status: cause.status,
        path: cause.path,
        requiredScopes: requiredScopesFor(cause.path),
        scopeHint: cause.scopeHint,
        detail: cause.body,
      },
      httpStatus,
    );
  }
  return jsonResponse({ error: 'internal', detail: String(cause) }, 500);
};

/**
 * Run `handler` with a resolved Jira context, returning its Response or a
 * mapped error Response. Centralizes the try/catch every endpoint needs.
 */
export const withJira = async (
  session: AstroSession | undefined,
  handler: (context: JiraContext) => Promise<Response>,
): Promise<Response> => {
  const resolved = await resolveJiraContext(session);
  if ('error' in resolved) return resolved.error;
  try {
    return await handler(resolved);
  } catch (cause) {
    return toErrorResponse(cause);
  }
};
