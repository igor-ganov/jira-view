import type { APIRoute } from 'astro';
import { getProjectBoards } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const GET: APIRoute = ({ params, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const boards = await getProjectBoards(accessToken, cloudId, params['key'] ?? '');
    return jsonResponse({ boards });
  });
