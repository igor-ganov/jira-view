import { JIRA_API_BASE } from 'astro:env/server';
import type {
  AccessibleResource,
  BoardColumn,
  BoardType,
  JiraBoard,
  JiraIssue,
  JiraProject,
  JiraSprint,
  JiraStatus,
  JiraTransition,
  JiraUser,
  SprintState,
  StatusCategory,
} from './types';

export type {
  AccessibleResource,
  BoardColumn,
  JiraBoard,
  JiraIssue,
  JiraProject,
  JiraSprint,
  JiraTransition,
} from './types';

/*
 * Thin Jira Cloud REST client over the OAuth gateway. Every call goes
 * through `${JIRA_API_BASE}/ex/jira/{cloudId}` with the 3LO access token.
 * Core REST: /rest/api/3 · Agile (boards/sprints/backlog/rank): /rest/agile/1.0
 * Docs: https://developer.atlassian.com/cloud/jira/software/rest/
 */

/** Thrown on any non-2xx Jira response; carries the status, path and raw body. */
export class JiraApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly path = '',
  ) {
    super(`Jira API error ${status} on ${path}`);
    this.name = 'JiraApiError';
  }
}

const authHeaders = (accessToken: string): Record<string, string> => ({
  authorization: `Bearer ${accessToken}`,
  accept: 'application/json',
});

/** Issue a Jira request and parse JSON, throwing `JiraApiError` on failure. */
const jiraFetch = async <T>(accessToken: string, path: string, init?: RequestInit): Promise<T> => {
  const headers: Record<string, string> = { ...authHeaders(accessToken) };
  if (init?.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${JIRA_API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new JiraApiError(response.status, await response.text(), path);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

const ex = (cloudId: string, path: string): string => `/ex/jira/${cloudId}${path}`;

/* ── Mappers: raw Jira payloads → normalized domain types ── */

const STATUS_CATEGORIES: ReadonlySet<string> = new Set(['new', 'indeterminate', 'done']);
const toStatusCategory = (key: string | undefined): StatusCategory =>
  key !== undefined && STATUS_CATEGORIES.has(key) ? (key as StatusCategory) : 'new';

type RawStatus = {
  readonly id: string;
  readonly name: string;
  readonly statusCategory?: { readonly key?: string };
};
const mapStatus = (raw: RawStatus): JiraStatus => ({
  id: raw.id,
  name: raw.name,
  category: toStatusCategory(raw.statusCategory?.key),
});

type RawUser = {
  readonly accountId: string;
  readonly displayName: string;
  readonly avatarUrls?: Readonly<Record<string, string>>;
};
/* Jira returns `null` (not just absent) for an unassigned issue. */
const mapUser = (raw: RawUser | null | undefined): JiraUser | undefined =>
  raw == null
    ? undefined
    : {
        accountId: raw.accountId,
        displayName: raw.displayName,
        ...(raw.avatarUrls?.['24x24'] === undefined ? {} : { avatarUrl: raw.avatarUrls['24x24'] }),
      };

type RawIssue = {
  readonly id: string;
  readonly key: string;
  readonly fields: {
    readonly summary: string;
    readonly issuetype: { readonly id: string; readonly name: string; readonly iconUrl?: string };
    readonly status: RawStatus;
    readonly assignee?: RawUser | null;
  };
};
const mapIssue = (raw: RawIssue): JiraIssue => {
  const assignee = mapUser(raw.fields.assignee);
  return {
    id: raw.id,
    key: raw.key,
    summary: raw.fields.summary,
    issueType: {
      id: raw.fields.issuetype.id,
      name: raw.fields.issuetype.name,
      ...(raw.fields.issuetype.iconUrl === undefined
        ? {}
        : { iconUrl: raw.fields.issuetype.iconUrl }),
    },
    status: mapStatus(raw.fields.status),
    ...(assignee === undefined ? {} : { assignee }),
  };
};

const ISSUE_FIELDS = 'summary,status,assignee,issuetype';

/* ── Read endpoints ── */

/** List the Atlassian sites (cloudIds) the token can reach. */
export const getAccessibleResources = (
  accessToken: string,
): Promise<readonly AccessibleResource[]> =>
  jiraFetch<readonly AccessibleResource[]>(accessToken, '/oauth/token/accessible-resources');

export const getProjects = async (
  accessToken: string,
  cloudId: string,
): Promise<readonly JiraProject[]> => {
  const body = await jiraFetch<{ readonly values: readonly JiraProject[] }>(
    accessToken,
    ex(cloudId, '/rest/api/3/project/search?maxResults=50&orderBy=name'),
  );
  return body.values;
};

type RawBoard = { readonly id: number; readonly name: string; readonly type: string };
const mapBoard = (raw: RawBoard): JiraBoard => ({
  id: raw.id,
  name: raw.name,
  type: (['scrum', 'kanban', 'simple'].includes(raw.type) ? raw.type : 'kanban') as BoardType,
});

export const getProjectBoards = async (
  accessToken: string,
  cloudId: string,
  projectKey: string,
): Promise<readonly JiraBoard[]> => {
  const body = await jiraFetch<{ readonly values: readonly RawBoard[] }>(
    accessToken,
    ex(
      cloudId,
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`,
    ),
  );
  return body.values.map(mapBoard);
};

export const getBoardBacklog = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<readonly JiraIssue[]> => {
  const body = await jiraFetch<{ readonly issues: readonly RawIssue[] }>(
    accessToken,
    ex(cloudId, `/rest/agile/1.0/board/${boardId}/backlog?maxResults=100&fields=${ISSUE_FIELDS}`),
  );
  return body.issues.map(mapIssue);
};

type RawSprint = {
  readonly id: number;
  readonly name: string;
  readonly state: string;
  readonly goal?: string;
};
const mapSprint = (raw: RawSprint): JiraSprint => ({
  id: raw.id,
  name: raw.name,
  state: (['active', 'future', 'closed'].includes(raw.state) ? raw.state : 'future') as SprintState,
  ...(raw.goal === undefined || raw.goal === '' ? {} : { goal: raw.goal }),
});

export const getBoardSprints = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<readonly JiraSprint[]> => {
  const body = await jiraFetch<{ readonly values: readonly RawSprint[] }>(
    accessToken,
    ex(cloudId, `/rest/agile/1.0/board/${boardId}/sprint?state=active,future&maxResults=50`),
  );
  return body.values.map(mapSprint);
};

export const getSprintIssues = async (
  accessToken: string,
  cloudId: string,
  sprintId: number,
): Promise<readonly JiraIssue[]> => {
  const body = await jiraFetch<{ readonly issues: readonly RawIssue[] }>(
    accessToken,
    ex(cloudId, `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=100&fields=${ISSUE_FIELDS}`),
  );
  return body.issues.map(mapIssue);
};

export const getBoardIssues = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<readonly JiraIssue[]> => {
  const body = await jiraFetch<{ readonly issues: readonly RawIssue[] }>(
    accessToken,
    ex(cloudId, `/rest/agile/1.0/board/${boardId}/issue?maxResults=100&fields=${ISSUE_FIELDS}`),
  );
  return body.issues.map(mapIssue);
};

type RawColumnConfig = {
  readonly columnConfig?: {
    readonly columns?: readonly {
      readonly name: string;
      readonly statuses?: readonly { readonly id: string }[];
    }[];
  };
};
export const getBoardColumns = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<readonly BoardColumn[]> => {
  const body = await jiraFetch<RawColumnConfig>(
    accessToken,
    ex(cloudId, `/rest/agile/1.0/board/${boardId}/configuration`),
  );
  return (body.columnConfig?.columns ?? []).map((column) => ({
    name: column.name,
    statusIds: (column.statuses ?? []).map((status) => status.id),
  }));
};

export const getIssue = async (
  accessToken: string,
  cloudId: string,
  issueKey: string,
): Promise<JiraIssue> => {
  const raw = await jiraFetch<RawIssue>(
    accessToken,
    ex(cloudId, `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${ISSUE_FIELDS}`),
  );
  return mapIssue(raw);
};

type RawTransition = {
  readonly id: string;
  readonly name: string;
  readonly to: RawStatus;
};
export const getTransitions = async (
  accessToken: string,
  cloudId: string,
  issueKey: string,
): Promise<readonly JiraTransition[]> => {
  const body = await jiraFetch<{ readonly transitions: readonly RawTransition[] }>(
    accessToken,
    ex(cloudId, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`),
  );
  return body.transitions.map((transition) => ({
    id: transition.id,
    name: transition.name,
    toStatusId: transition.to.id,
    toStatusName: transition.to.name,
    toStatusCategory: toStatusCategory(transition.to.statusCategory?.key),
  }));
};

/* ── Write endpoints ── */

export const transitionIssue = (
  accessToken: string,
  cloudId: string,
  issueKey: string,
  transitionId: string,
): Promise<void> =>
  jiraFetch<void>(
    accessToken,
    ex(cloudId, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`),
    {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    },
  );

/** Reorder: place `issues` before OR after the anchor issue (exactly one). */
export const rankIssues = (
  accessToken: string,
  cloudId: string,
  issues: readonly string[],
  anchor: { readonly before: string } | { readonly after: string },
): Promise<void> =>
  jiraFetch<void>(accessToken, ex(cloudId, '/rest/agile/1.0/issue/rank'), {
    method: 'PUT',
    body: JSON.stringify({
      issues,
      ...('before' in anchor
        ? { rankBeforeIssue: anchor.before }
        : { rankAfterIssue: anchor.after }),
    }),
  });

export const moveIssuesToSprint = (
  accessToken: string,
  cloudId: string,
  sprintId: number,
  issues: readonly string[],
): Promise<void> =>
  jiraFetch<void>(accessToken, ex(cloudId, `/rest/agile/1.0/sprint/${sprintId}/issue`), {
    method: 'POST',
    body: JSON.stringify({ issues }),
  });

export const moveIssuesToBacklog = (
  accessToken: string,
  cloudId: string,
  issues: readonly string[],
): Promise<void> =>
  jiraFetch<void>(accessToken, ex(cloudId, '/rest/agile/1.0/backlog/issue'), {
    method: 'POST',
    body: JSON.stringify({ issues }),
  });
