import type { APIRoute } from 'astro';
import { loadKanbanData } from '@/features/jira/board-data';
import { jsonResponse, withJira } from '@/features/jira/server';

export const GET: APIRoute = ({ params, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const data = await loadKanbanData(accessToken, cloudId, Number(params['id']));
    return jsonResponse(data);
  });
