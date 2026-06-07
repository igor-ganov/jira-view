import type { APIRoute } from 'astro';
import { getIssue } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const GET: APIRoute = ({ params, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const issue = await getIssue(accessToken, cloudId, params['key'] ?? '');
    return jsonResponse({ issue });
  });
