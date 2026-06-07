import type { ScrumBoardData } from './board-data';
import type { JiraIssue } from './types';

/*
 * Pure, immutable transforms over the Scrum read-model used for optimistic
 * drag-and-drop / keyboard reordering. Each returns a new ScrumBoardData;
 * the caller snapshots the old one to roll back if the server write fails.
 */

export type Container =
  | { readonly kind: 'backlog' }
  | { readonly kind: 'sprint'; readonly sprintId: number };

const findIssue = (data: ScrumBoardData, key: string): JiraIssue | undefined =>
  data.backlog.find((issue) => issue.key === key) ??
  data.sprints.flatMap((sprint) => sprint.issues).find((issue) => issue.key === key);

/** Which container currently holds `key`, if any. */
export const locate = (data: ScrumBoardData, key: string): Container | undefined => {
  if (data.backlog.some((issue) => issue.key === key)) return { kind: 'backlog' };
  const sprint = data.sprints.find((entry) => entry.issues.some((issue) => issue.key === key));
  return sprint ? { kind: 'sprint', sprintId: sprint.sprint.id } : undefined;
};

const withoutKey = (data: ScrumBoardData, key: string): ScrumBoardData => ({
  backlog: data.backlog.filter((issue) => issue.key !== key),
  sprints: data.sprints.map((sprint) => ({
    ...sprint,
    issues: sprint.issues.filter((issue) => issue.key !== key),
  })),
});

const insertInto = (
  data: ScrumBoardData,
  issue: JiraIssue,
  container: Container,
  beforeKey: string | undefined,
): ScrumBoardData => {
  const place = (issues: readonly JiraIssue[]): readonly JiraIssue[] => {
    const index = beforeKey ? issues.findIndex((candidate) => candidate.key === beforeKey) : -1;
    if (index < 0) return [...issues, issue];
    return [...issues.slice(0, index), issue, ...issues.slice(index)];
  };
  if (container.kind === 'backlog') return { ...data, backlog: place(data.backlog) };
  return {
    ...data,
    sprints: data.sprints.map((sprint) =>
      sprint.sprint.id === container.sprintId
        ? { ...sprint, issues: place(sprint.issues) }
        : sprint,
    ),
  };
};

/** Move `key` to the end of `container` (drop onto an empty area / container). */
export const moveIssue = (
  data: ScrumBoardData,
  key: string,
  container: Container,
): ScrumBoardData => {
  const issue = findIssue(data, key);
  if (!issue) return data;
  return insertInto(withoutKey(data, key), issue, container, undefined);
};

/** Place `key` immediately before `beforeKey`, in whichever container holds the anchor. */
export const reorderBefore = (
  data: ScrumBoardData,
  key: string,
  beforeKey: string,
): ScrumBoardData => {
  const issue = findIssue(data, key);
  const target = locate(data, beforeKey);
  if (!issue || !target || key === beforeKey) return data;
  return insertInto(withoutKey(data, key), issue, target, beforeKey);
};
