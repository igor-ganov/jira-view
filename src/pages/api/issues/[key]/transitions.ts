import type { APIRoute } from 'astro';
import { getTransitions } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const GET: APIRoute = ({ params, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const transitions = await getTransitions(accessToken, cloudId, params['key'] ?? '');
    return jsonResponse({ transitions });
  });
