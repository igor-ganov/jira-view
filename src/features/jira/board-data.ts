import { getBoardBacklog, getBoardIssues, getBoardSprints, getSprintIssues } from './client';
import type { JiraIssue, JiraSprint } from './types';

/*
 * Board read-models assembled from several Jira calls so each `/api/*`
 * endpoint stays a one-liner and the client makes a single request per view.
 */

export type SprintWithIssues = {
  readonly sprint: JiraSprint;
  readonly issues: readonly JiraIssue[];
};
export type ScrumBoardData = {
  readonly backlog: readonly JiraIssue[];
  readonly sprints: readonly SprintWithIssues[];
};
/* Kanban boards are shown as a single flat task list (no status columns). */
export type KanbanBoardData = {
  readonly issues: readonly JiraIssue[];
};

/** How many recent closed sprints to surface in the "Past sprints" block. */
const RECENT_CLOSED = 5;

export const loadScrumData = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<ScrumBoardData> => {
  const [backlog, current, closed] = await Promise.all([
    getBoardBacklog(accessToken, cloudId, boardId),
    getBoardSprints(accessToken, cloudId, boardId, 'active,future'),
    getBoardSprints(accessToken, cloudId, boardId, 'closed'),
  ]);
  /* Closed sprints can be a long history — keep only the most recent few
     (higher id ≈ more recently created/closed). */
  const recentClosed = [...closed].sort((a, b) => b.id - a.id).slice(0, RECENT_CLOSED);
  const sprints = [...current, ...recentClosed];
  const sprintsWithIssues = await Promise.all(
    sprints.map(async (sprint) => ({
      sprint,
      issues: await getSprintIssues(accessToken, cloudId, sprint.id),
    })),
  );
  return { backlog, sprints: sprintsWithIssues };
};

export const loadKanbanData = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<KanbanBoardData> => {
  const issues = await getBoardIssues(accessToken, cloudId, boardId);
  return { issues };
};
