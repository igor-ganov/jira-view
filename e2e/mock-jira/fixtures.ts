/*
 * In-memory Jira fixture state for E2E. Mutable so that writes
 * (rank/move/transition) are reflected by subsequent reads, exactly like
 * the real API. `createState()` returns a fresh graph; the server calls
 * it on boot and on `POST /__mock/reset`.
 */

export type MockStatus = {
  id: string;
  name: string;
  categoryKey: 'new' | 'indeterminate' | 'done';
};

export const STATUSES: Record<string, MockStatus> = {
  s1: { id: 's1', name: 'To Do', categoryKey: 'new' },
  s2: { id: 's2', name: 'In Progress', categoryKey: 'indeterminate' },
  s3: { id: 's3', name: 'Done', categoryKey: 'done' },
};

/* Transition id → target status id (a fully-connected mini workflow). */
export const TRANSITION_TARGET: Record<string, string> = { '11': 's1', '21': 's2', '31': 's3' };

export type MockIssue = {
  id: string;
  key: string;
  summary: string;
  issuetype: { id: string; name: string; iconUrl: string };
  statusId: string;
  assignee?: { accountId: string; displayName: string; avatarUrls: Record<string, string> };
  /* Container within the project's scrum board. */
  container: { kind: 'backlog' } | { kind: 'sprint'; sprintId: number };
  boardId: number;
};

export type MockSprint = {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  goal?: string;
  boardId: number;
};
export type MockBoard = { id: number; name: string; type: 'scrum' | 'kanban'; projectKey: string };
export type MockProject = { id: string; key: string; name: string; projectTypeKey: string };

export type FailureRule = { method: string; path: string; status: number; body?: string };

export type MockState = {
  projects: MockProject[];
  boards: MockBoard[];
  sprints: MockSprint[];
  /* Ordered: array index within a container is the rank. */
  issues: MockIssue[];
  failures: FailureRule[];
};

const story = (id: string, name: string) => ({ id, name, iconUrl: `https://mock/icon/${id}.png` });
const ALICE = {
  accountId: 'u-alice',
  displayName: 'Alice',
  avatarUrls: { '24x24': 'https://mock/alice.png' },
};

export const createState = (): MockState => ({
  projects: [
    { id: '10001', key: 'PROJ', name: 'Scrum Project', projectTypeKey: 'software' },
    { id: '10002', key: 'KAN', name: 'Kanban Project', projectTypeKey: 'software' },
  ],
  boards: [
    { id: 1, name: 'PROJ Scrum Board', type: 'scrum', projectKey: 'PROJ' },
    { id: 2, name: 'KAN Kanban Board', type: 'kanban', projectKey: 'KAN' },
  ],
  sprints: [
    { id: 101, name: 'Sprint 1', state: 'active', goal: 'Ship the thing', boardId: 1 },
    { id: 102, name: 'Sprint 2', state: 'future', boardId: 1 },
  ],
  issues: [
    issue('PROJ-1', 'Set up CI', 's1', 1, { kind: 'backlog' }, ALICE),
    issue('PROJ-2', 'Write docs', 's1', 1, { kind: 'backlog' }),
    issue('PROJ-3', 'Refactor auth', 's2', 1, { kind: 'backlog' }),
    issue('ERR-1', 'Flaky on purpose', 's1', 1, { kind: 'backlog' }),
    issue('PROJ-4', 'Build board view', 's2', 1, { kind: 'sprint', sprintId: 101 }, ALICE),
    issue('PROJ-5', 'Add drag and drop', 's1', 1, { kind: 'sprint', sprintId: 101 }),
    issue('KAN-1', 'Triage inbox', 's1', 2, { kind: 'backlog' }),
    issue('KAN-2', 'Investigate bug', 's2', 2, { kind: 'backlog' }, ALICE),
    issue('KAN-3', 'Release notes', 's3', 2, { kind: 'backlog' }),
    issue('KAN-4', 'Plan roadmap', 's1', 2, { kind: 'backlog' }),
  ],
  failures: [],
});

let counter = 0;
function issue(
  key: string,
  summary: string,
  statusId: string,
  boardId: number,
  container: MockIssue['container'],
  assignee?: MockIssue['assignee'],
): MockIssue {
  counter += 1;
  return {
    id: String(20000 + counter),
    key,
    summary,
    issuetype: story('it-1', 'Story'),
    statusId,
    container,
    boardId,
    ...(assignee ? { assignee } : {}),
  };
}

export const SITE = {
  id: 'mock-cloud-id',
  name: 'Mock Site',
  url: 'https://mock.atlassian.net',
  scopes: [],
};
