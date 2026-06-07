import type { APIRoute } from 'astro';
import { moveIssuesToBacklog } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const POST: APIRoute = ({ request, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const { issues } = (await request.json()) as { issues: readonly string[] };
    await moveIssuesToBacklog(accessToken, cloudId, issues);
    return jsonResponse({ ok: true });
  });
