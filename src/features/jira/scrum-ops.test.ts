import { describe, expect, it } from 'vitest';
import type { ScrumBoardData } from './board-data';
import { locate, moveIssue, reorderBefore } from './scrum-ops';
import type { JiraIssue } from './types';

const issue = (key: string): JiraIssue => ({
  id: key,
  key,
  summary: key,
  issueType: { id: 't', name: 'Story' },
  status: { id: 's1', name: 'To Do', category: 'new' },
});

const data = (): ScrumBoardData => ({
  backlog: [issue('A'), issue('B'), issue('C')],
  sprints: [{ sprint: { id: 1, name: 'S1', state: 'active' }, issues: [issue('X'), issue('Y')] }],
});

const keysIn = (d: ScrumBoardData, where: 'backlog' | number): string[] =>
  (where === 'backlog'
    ? d.backlog
    : (d.sprints.find((s) => s.sprint.id === where)?.issues ?? [])
  ).map((i) => i.key);

describe('locate', () => {
  it('finds the container holding a key', () => {
    expect(locate(data(), 'B')).toEqual({ kind: 'backlog' });
    expect(locate(data(), 'X')).toEqual({ kind: 'sprint', sprintId: 1 });
    expect(locate(data(), 'Z')).toBeUndefined();
  });
});

describe('moveIssue', () => {
  it('moves a backlog issue to the end of a sprint', () => {
    const next = moveIssue(data(), 'A', { kind: 'sprint', sprintId: 1 });
    expect(keysIn(next, 'backlog')).toEqual(['B', 'C']);
    expect(keysIn(next, 1)).toEqual(['X', 'Y', 'A']);
  });

  it('moves a sprint issue back to the backlog', () => {
    const next = moveIssue(data(), 'X', { kind: 'backlog' });
    expect(keysIn(next, 1)).toEqual(['Y']);
    expect(keysIn(next, 'backlog')).toEqual(['A', 'B', 'C', 'X']);
  });
});

describe('reorderBefore', () => {
  it('reorders within a container', () => {
    expect(keysIn(reorderBefore(data(), 'C', 'A'), 'backlog')).toEqual(['C', 'A', 'B']);
  });

  it('moves across containers, landing before the anchor', () => {
    const next = reorderBefore(data(), 'A', 'Y');
    expect(keysIn(next, 'backlog')).toEqual(['B', 'C']);
    expect(keysIn(next, 1)).toEqual(['X', 'A', 'Y']);
  });

  it('is a no-op when key equals anchor', () => {
    expect(reorderBefore(data(), 'A', 'A')).toEqual(data());
  });
});
