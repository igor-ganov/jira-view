import type { APIRoute } from 'astro';
import { moveIssuesToSprint } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const POST: APIRoute = ({ params, request, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const { issues } = (await request.json()) as { issues: readonly string[] };
    await moveIssuesToSprint(accessToken, cloudId, Number(params['id']), issues);
    return jsonResponse({ ok: true });
  });
