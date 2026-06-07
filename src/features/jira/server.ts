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

/** Map a thrown error to a JSON Response with the appropriate HTTP status. */
export const toErrorResponse = (cause: unknown): Response => {
  if (cause instanceof JiraApiError) {
    const status = cause.status === 401 ? 401 : cause.status === 403 ? 403 : cause.status;
    const code =
      cause.status === 401
        ? 'jira-unauthorized'
        : cause.status === 403
          ? 'jira-forbidden'
          : cause.status === 409
            ? 'jira-conflict'
            : 'jira-error';
    const httpStatus = status >= 500 ? 502 : status;
    return jsonResponse({ error: code, status: cause.status, detail: cause.body }, httpStatus);
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
