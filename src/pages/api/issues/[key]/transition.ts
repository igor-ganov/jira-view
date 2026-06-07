import type { APIRoute } from 'astro';
import { transitionIssue } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const POST: APIRoute = ({ params, request, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const { transitionId } = (await request.json()) as { transitionId: string };
    await transitionIssue(accessToken, cloudId, params['key'] ?? '', transitionId);
    return jsonResponse({ ok: true });
  });
