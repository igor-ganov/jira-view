import type { APIRoute } from 'astro';
import { getProjects } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

export const GET: APIRoute = ({ session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const projects = await getProjects(accessToken, cloudId);
    return jsonResponse({ projects });
  });
