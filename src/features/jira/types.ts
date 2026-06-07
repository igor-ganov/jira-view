/*
 * Jira domain types — the normalized shapes our app and API endpoints
 * speak, decoupled from the raw (deeply nested) Jira REST payloads.
 * Raw → normalized mapping lives in `client.ts`.
 */

/** DataTransfer MIME carrying the dragged issue key during native DnD. */
export const DRAG_MIME = 'application/x-issue-key';

export type AccessibleResource = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly scopes: readonly string[];
};

export type JiraProject = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly projectTypeKey: string;
  readonly avatarUrls?: Readonly<Record<string, string>>;
};

export type BoardType = 'scrum' | 'kanban' | 'simple';

export type JiraBoard = {
  readonly id: number;
  readonly name: string;
  readonly type: BoardType;
};

export type SprintState = 'active' | 'future' | 'closed';

export type JiraSprint = {
  readonly id: number;
  readonly name: string;
  readonly state: SprintState;
  readonly goal?: string;
};

/** Status category key, used for coloring (new = grey, indeterminate = blue, done = green). */
export type StatusCategory = 'new' | 'indeterminate' | 'done';

export type JiraStatus = {
  readonly id: string;
  readonly name: string;
  readonly category: StatusCategory;
};

export type JiraUser = {
  readonly accountId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
};

export type JiraIssue = {
  readonly id: string;
  readonly key: string;
  readonly summary: string;
  readonly issueType: { readonly id: string; readonly name: string; readonly iconUrl?: string };
  readonly status: JiraStatus;
  readonly assignee?: JiraUser;
};

export type JiraTransition = {
  readonly id: string;
  readonly name: string;
  readonly toStatusId: string;
  readonly toStatusName: string;
  readonly toStatusCategory: StatusCategory;
};

/** A board column groups one or more statuses (Kanban / Scrum sprint board). */
export type BoardColumn = {
  readonly name: string;
  readonly statusIds: readonly string[];
};
