import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBoardBacklog,
  getProjectBoards,
  JiraApiError,
  rankIssues,
  transitionIssue,
} from './client';

type FetchArgs = { url: string; init: RequestInit | undefined };

const lastCall = (): FetchArgs => {
  const mock = vi.mocked(globalThis.fetch);
  const [url, init] = mock.mock.calls.at(-1) ?? [];
  return { url: String(url), init };
};

const stubFetch = (body: unknown, ok = true, status = 200): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    })),
  );
};

afterEach(() => vi.unstubAllGlobals());

describe('getProjectBoards', () => {
  it('maps board types and falls back unknown → kanban', async () => {
    stubFetch({
      values: [
        { id: 1, name: 'B', type: 'scrum' },
        { id: 2, name: 'K', type: 'weird' },
      ],
    });
    const boards = await getProjectBoards('tok', 'cloud', 'PROJ');
    expect(boards).toEqual([
      { id: 1, name: 'B', type: 'scrum' },
      { id: 2, name: 'K', type: 'kanban' },
    ]);
    expect(lastCall().url).toContain('/ex/jira/cloud/rest/agile/1.0/board?projectKeyOrId=PROJ');
  });
});

describe('getBoardBacklog', () => {
  it('normalizes a raw issue, including status category and optional assignee', async () => {
    stubFetch({
      issues: [
        {
          id: '1',
          key: 'PROJ-1',
          fields: {
            summary: 'Do it',
            issuetype: { id: 'it', name: 'Story' },
            status: { id: 's2', name: 'In Progress', statusCategory: { key: 'indeterminate' } },
            assignee: { accountId: 'a', displayName: 'Al', avatarUrls: { '24x24': 'x.png' } },
          },
        },
      ],
    });
    const [issue] = await getBoardBacklog('tok', 'cloud', 1);
    expect(issue).toEqual({
      id: '1',
      key: 'PROJ-1',
      summary: 'Do it',
      issueType: { id: 'it', name: 'Story' },
      status: { id: 's2', name: 'In Progress', category: 'indeterminate' },
      assignee: { accountId: 'a', displayName: 'Al', avatarUrl: 'x.png' },
    });
  });

  it('maps an unassigned issue (assignee: null) without throwing', async () => {
    stubFetch({
      issues: [
        {
          id: '2',
          key: 'PROJ-2',
          fields: {
            summary: 'Unassigned',
            issuetype: { id: 'it', name: 'Story' },
            status: { id: 's1', name: 'To Do', statusCategory: { key: 'new' } },
            assignee: null,
          },
        },
      ],
    });
    const [issue] = await getBoardBacklog('tok', 'cloud', 1);
    expect(issue?.assignee).toBeUndefined();
    expect(issue?.key).toBe('PROJ-2');
  });
});

describe('JiraApiError', () => {
  it('throws with the upstream status on a non-2xx response', async () => {
    stubFetch({ message: 'nope' }, false, 403);
    await expect(getProjectBoards('tok', 'cloud', 'PROJ')).rejects.toBeInstanceOf(JiraApiError);
    stubFetch({ message: 'nope' }, false, 403);
    await expect(getProjectBoards('tok', 'cloud', 'PROJ')).rejects.toMatchObject({ status: 403 });
  });
});

describe('write payloads', () => {
  it('rankIssues sends rankBeforeIssue / rankAfterIssue', async () => {
    stubFetch(undefined, true, 204);
    await rankIssues('tok', 'cloud', ['PROJ-1'], { before: 'PROJ-2' });
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({
      issues: ['PROJ-1'],
      rankBeforeIssue: 'PROJ-2',
    });

    stubFetch(undefined, true, 204);
    await rankIssues('tok', 'cloud', ['PROJ-1'], { after: 'PROJ-3' });
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({
      issues: ['PROJ-1'],
      rankAfterIssue: 'PROJ-3',
    });
  });

  it('transitionIssue posts the transition id', async () => {
    stubFetch(undefined, true, 204);
    await transitionIssue('tok', 'cloud', 'PROJ-1', '21');
    const { url, init } = lastCall();
    expect(init?.method).toBe('POST');
    expect(url).toContain('/rest/api/3/issue/PROJ-1/transitions');
    expect(JSON.parse(String(init?.body))).toEqual({ transition: { id: '21' } });
  });
});
