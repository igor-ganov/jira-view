/*
 * Mock Jira Cloud server for deterministic E2E. Implements just the
 * endpoints `src/features/jira/client.ts` calls, over an in-memory graph
 * that mutates on writes. Boots both via Playwright `webServer` and
 * standalone (`bun run e2e/mock-jira/server.ts`). Control routes:
 *   POST /__mock/reset            → reseed state, clear failures
 *   POST /__mock/fail {method,path,status,body?} → inject a failure rule
 */
import {
  createState,
  type FailureRule,
  type MockIssue,
  type MockState,
  SITE,
  STATUSES,
  TRANSITION_TARGET,
} from './fixtures';

const PORT = Number(process.env['MOCK_PORT'] ?? 4500);

let state: MockState = createState();

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const rawIssue = (issue: MockIssue) => {
  const status = STATUSES[issue.statusId];
  return {
    id: issue.id,
    key: issue.key,
    fields: {
      summary: issue.summary,
      issuetype: issue.issuetype,
      status: status
        ? { id: status.id, name: status.name, statusCategory: { key: status.categoryKey } }
        : { id: 'unknown', name: 'Unknown', statusCategory: { key: 'new' } },
      /* Real Jira sends null (not an absent key) for an unassigned issue. */
      assignee: issue.assignee ?? null,
    },
  };
};

const transitionIdForStatus = (statusId: string): string =>
  Object.keys(TRANSITION_TARGET).find((id) => TRANSITION_TARGET[id] === statusId) ?? '11';

const transitionsFor = (issue: MockIssue) =>
  Object.values(STATUSES)
    .filter((status) => status.id !== issue.statusId)
    .map((status) => ({
      id: transitionIdForStatus(status.id),
      name: `Move to ${status.name}`,
      to: { id: status.id, name: status.name, statusCategory: { key: status.categoryKey } },
    }));

const columnsForBoard = () => ({
  columnConfig: {
    columns: [
      { name: 'To Do', statuses: [{ id: 's1' }] },
      { name: 'In Progress', statuses: [{ id: 's2' }] },
      { name: 'Done', statuses: [{ id: 's3' }] },
    ],
  },
});

const findIssue = (key: string): MockIssue | undefined => state.issues.find((i) => i.key === key);

const matchedFailure = (method: string, path: string): FailureRule | undefined =>
  state.failures.find((rule) => rule.method === method && path.includes(rule.path));

/* ── Write handlers ── */

const applyTransition = (key: string, transitionId: string): void => {
  const issue = findIssue(key);
  const target = TRANSITION_TARGET[transitionId];
  if (issue && target) issue.statusId = target;
};

const applyRank = (keys: string[], before: string | undefined, after: string | undefined): void => {
  const moved = keys
    .map((key) => state.issues.find((i) => i.key === key))
    .filter((i): i is MockIssue => i !== undefined);
  state.issues = state.issues.filter((i) => !keys.includes(i.key));
  const anchorKey = before ?? after;
  const anchorIndex = state.issues.findIndex((i) => i.key === anchorKey);
  const insertAt = anchorIndex < 0 ? state.issues.length : before ? anchorIndex : anchorIndex + 1;
  state.issues.splice(insertAt, 0, ...moved);
};

const moveToSprint = (keys: string[], sprintId: number): void => {
  for (const key of keys) {
    const issue = findIssue(key);
    if (issue) issue.container = { kind: 'sprint', sprintId };
  }
};

const moveToBacklog = (keys: string[]): void => {
  for (const key of keys) {
    const issue = findIssue(key);
    if (issue) issue.container = { kind: 'backlog' };
  }
};

/* ── Router ── */

const handle = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  /* Control plane. */
  if (pathname === '/__mock/reset' && method === 'POST') {
    state = createState();
    return json({ ok: true });
  }
  if (pathname === '/__mock/fail' && method === 'POST') {
    const rule = (await req.json()) as FailureRule;
    state.failures.push(rule);
    return json({ ok: true });
  }

  /* Injected failures take precedence over real handling. */
  const failure = matchedFailure(method, pathname);
  if (failure)
    return new Response(failure.body ?? `Injected ${failure.status}`, { status: failure.status });

  /* Stand-in for the Atlassian consent screen (re-login lands here). */
  if (pathname === '/authorize' && method === 'GET') {
    return new Response(
      '<!doctype html><title>Mock Login</title><h1 data-testid="mock-login">Mock Atlassian Login</h1>',
      {
        status: 200,
        headers: { 'content-type': 'text/html' },
      },
    );
  }

  if (pathname === '/oauth/token/accessible-resources' && method === 'GET') return json([SITE]);
  if (pathname === '/oauth/token' && method === 'POST') {
    return json({
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'mock',
    });
  }

  /* Everything else lives under /ex/jira/{cloudId}/... */
  const ex = pathname.match(/^\/ex\/jira\/[^/]+(\/.*)$/);
  if (!ex?.[1]) return json({ error: 'not-found', pathname }, 404);
  const rest = ex[1];

  if (rest.startsWith('/rest/api/3/project/search') && method === 'GET') {
    return json({ values: state.projects, isLast: true, total: state.projects.length });
  }

  if (rest === '/rest/agile/1.0/board' && method === 'GET') {
    const projectKey = url.searchParams.get('projectKeyOrId');
    const values = state.boards.filter((b) => !projectKey || b.projectKey === projectKey);
    return json({ values, isLast: true });
  }

  const backlog = rest.match(/^\/rest\/agile\/1\.0\/board\/(\d+)\/backlog/);
  if (backlog && method === 'GET') {
    const boardId = Number(backlog[1]);
    const issues = state.issues.filter(
      (i) => i.boardId === boardId && i.container.kind === 'backlog',
    );
    return json({ issues: issues.map(rawIssue), total: issues.length });
  }

  const sprintsList = rest.match(/^\/rest\/agile\/1\.0\/board\/(\d+)\/sprint(\?|$)/);
  if (sprintsList && method === 'GET') {
    const boardId = Number(sprintsList[1]);
    const wanted = (url.searchParams.get('state') ?? 'active,future').split(',');
    const values = state.sprints.filter((s) => s.boardId === boardId && wanted.includes(s.state));
    return json({ values, isLast: true });
  }

  const sprintIssues = rest.match(/^\/rest\/agile\/1\.0\/sprint\/(\d+)\/issue/);
  if (sprintIssues && method === 'GET') {
    const sprintId = Number(sprintIssues[1]);
    const issues = state.issues.filter(
      (i) => i.container.kind === 'sprint' && i.container.sprintId === sprintId,
    );
    return json({ issues: issues.map(rawIssue), total: issues.length });
  }
  if (sprintIssues && method === 'POST') {
    const sprintId = Number(sprintIssues[1]);
    const body = (await req.json()) as { issues: string[] };
    moveToSprint(body.issues, sprintId);
    return new Response(null, { status: 204 });
  }

  const boardIssues = rest.match(/^\/rest\/agile\/1\.0\/board\/(\d+)\/issue/);
  if (boardIssues && method === 'GET') {
    const boardId = Number(boardIssues[1]);
    const issues = state.issues.filter((i) => i.boardId === boardId);
    return json({ issues: issues.map(rawIssue), total: issues.length });
  }

  const boardConfig = rest.match(/^\/rest\/agile\/1\.0\/board\/(\d+)\/configuration/);
  if (boardConfig && method === 'GET') return json(columnsForBoard());

  if (rest.startsWith('/rest/agile/1.0/backlog/issue') && method === 'POST') {
    const body = (await req.json()) as { issues: string[] };
    moveToBacklog(body.issues);
    return new Response(null, { status: 204 });
  }

  if (rest.startsWith('/rest/agile/1.0/issue/rank') && method === 'PUT') {
    const body = (await req.json()) as {
      issues: string[];
      rankBeforeIssue?: string;
      rankAfterIssue?: string;
    };
    applyRank(body.issues, body.rankBeforeIssue, body.rankAfterIssue);
    return new Response(null, { status: 204 });
  }

  const transitions = rest.match(/^\/rest\/api\/3\/issue\/([^/]+)\/transitions/);
  if (transitions) {
    const key = decodeURIComponent(transitions[1] ?? '');
    const issue = findIssue(key);
    if (!issue) return json({ error: 'issue-not-found' }, 404);
    if (method === 'GET') return json({ transitions: transitionsFor(issue) });
    if (method === 'POST') {
      const body = (await req.json()) as { transition: { id: string } };
      applyTransition(key, body.transition.id);
      return new Response(null, { status: 204 });
    }
  }

  const issueDetail = rest.match(/^\/rest\/api\/3\/issue\/([^/?]+)/);
  if (issueDetail && method === 'GET') {
    const key = decodeURIComponent(issueDetail[1] ?? '');
    const issue = findIssue(key);
    return issue ? json(rawIssue(issue)) : json({ error: 'issue-not-found' }, 404);
  }

  return json({ error: 'unhandled', method, rest }, 404);
};

Bun.serve({ port: PORT, fetch: handle });
// eslint-disable-next-line no-console
console.log(`[mock-jira] listening on http://localhost:${PORT}`);
