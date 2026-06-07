import {
  getBoardBacklog,
  getBoardColumns,
  getBoardIssues,
  getBoardSprints,
  getSprintIssues,
} from './client';
import type { BoardColumn, JiraIssue, JiraSprint } from './types';

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
export type KanbanBoardData = {
  readonly columns: readonly BoardColumn[];
  readonly issues: readonly JiraIssue[];
};

export const loadScrumData = async (
  accessToken: string,
  cloudId: string,
  boardId: number,
): Promise<ScrumBoardData> => {
  const [backlog, sprints] = await Promise.all([
    getBoardBacklog(accessToken, cloudId, boardId),
    getBoardSprints(accessToken, cloudId, boardId),
  ]);
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
  const [columns, issues] = await Promise.all([
    getBoardColumns(accessToken, cloudId, boardId),
    getBoardIssues(accessToken, cloudId, boardId),
  ]);
  return { columns, issues };
};
