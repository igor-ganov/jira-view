import type { APIRoute } from 'astro';
import { getTransitions, transitionIssue } from '@/features/jira/client';
import { jsonResponse, withJira } from '@/features/jira/server';

type BulkRequest = { readonly keys: readonly string[]; readonly toStatusName: string };
export type BulkResult = { readonly key: string; readonly ok: boolean; readonly error?: string };

/*
 * Bulk transition by target status name (transition ids differ per issue,
 * so we resolve each issue's matching transition server-side). Partial
 * failure is first-class: every key gets an independent result and the
 * call still returns 200 so the client can show what succeeded vs failed.
 */
export const POST: APIRoute = ({ request, session }) =>
  withJira(session, async ({ accessToken, cloudId }) => {
    const { keys, toStatusName } = (await request.json()) as BulkRequest;
    const results = await Promise.all(
      keys.map(async (key): Promise<BulkResult> => {
        try {
          const transitions = await getTransitions(accessToken, cloudId, key);
          const match = transitions.find((transition) => transition.toStatusName === toStatusName);
          if (!match) return { key, ok: false, error: 'no-transition' };
          await transitionIssue(accessToken, cloudId, key, match.id);
          return { key, ok: true };
        } catch {
          return { key, ok: false, error: 'failed' };
        }
      }),
    );
    return jsonResponse({ results });
  });
