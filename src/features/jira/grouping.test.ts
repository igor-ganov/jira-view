import { describe, expect, it } from 'vitest';
import { groupByParent } from './grouping';
import type { JiraIssue } from './types';

const issue = (key: string, parentKey?: string): JiraIssue => ({
  id: key,
  key,
  summary: key,
  issueType: { id: 't', name: 'Task' },
  status: { id: 's1', name: 'To Do', category: 'new' },
  ...(parentKey ? { parentKey } : {}),
});

describe('groupByParent', () => {
  it('nests sub-tasks under their parent and keeps order', () => {
    const groups = groupByParent([
      issue('A'),
      issue('A-1', 'A'),
      issue('B'),
      issue('A-2', 'A'),
    ]);
    expect(groups.map((g) => g.issue.key)).toEqual(['A', 'B']);
    expect(groups[0]?.children.map((c) => c.key)).toEqual(['A-1', 'A-2']);
    expect(groups[1]?.children).toEqual([]);
  });

  it('keeps a sub-task top-level when its parent is not in the list', () => {
    const groups = groupByParent([issue('orphan', 'MISSING'), issue('C')]);
    expect(groups.map((g) => g.issue.key)).toEqual(['orphan', 'C']);
    expect(groups[0]?.children).toEqual([]);
  });
});
