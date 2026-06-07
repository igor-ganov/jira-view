import { describe, expect, it } from 'vitest';
import { JiraApiError } from './client';
import { toErrorResponse } from './server';

const read = async (response: Response): Promise<{ status: number; body: unknown }> => ({
  status: response.status,
  body: await response.json(),
});

describe('toErrorResponse', () => {
  it('passes 401 through as a re-login signal', async () => {
    const { status, body } = await read(toErrorResponse(new JiraApiError(401, 'x')));
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: 'jira-unauthorized', status: 401 });
  });

  it('passes 403 through as a scope/permission signal', async () => {
    const { status, body } = await read(
      toErrorResponse(new JiraApiError(403, 'scope does not match')),
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: 'jira-forbidden' });
  });

  it('maps 409 to a conflict code', async () => {
    const { body } = await read(toErrorResponse(new JiraApiError(409, 'rank conflict')));
    expect(body).toMatchObject({ error: 'jira-conflict', status: 409 });
  });

  it('collapses upstream 5xx to a 502 gateway error', async () => {
    const { status } = await read(toErrorResponse(new JiraApiError(500, 'boom')));
    expect(status).toBe(502);
  });

  it('maps unknown throwables to a 500 internal error', async () => {
    const { status, body } = await read(toErrorResponse(new Error('weird')));
    expect(status).toBe(500);
    expect(body).toMatchObject({ error: 'internal' });
  });
});
