import type { APIRoute } from 'astro';
import { rankIssues } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

type RankRequest = {
  readonly issues: readonly string[];
  readonly before?: string;
  readonly after?: string;
};

export const POST: APIRoute = ({ request, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const { issues, before, after } = (await request.json()) as RankRequest;
    const anchor = before !== undefined ? { before } : after !== undefined ? { after } : undefined;
    if (!anchor) return jsonResponse({ error: 'missing-anchor' }, 400);
    await rankIssues(accessToken, cloudId, issues, anchor);
    return jsonResponse({ ok: true });
  });
