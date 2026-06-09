import type { JiraIssue } from './types';

/*
 * Group a flat issue list into a parent → sub-tasks tree (Todoist-style).
 * An issue whose `parentKey` is also present in the list becomes a child
 * of that parent and is removed from the top level. Sub-tasks whose parent
 * is NOT in the list stay top-level (shown standalone). Order is preserved:
 * top-level keep their original order; children keep theirs under the parent.
 */
export type IssueGroup = { readonly issue: JiraIssue; readonly children: readonly JiraIssue[] };

export const groupByParent = (issues: readonly JiraIssue[]): readonly IssueGroup[] => {
  const present = new Set(issues.map((issue) => issue.key));
  const childrenByParent = new Map<string, JiraIssue[]>();
  for (const issue of issues) {
    if (issue.parentKey && present.has(issue.parentKey)) {
      const bucket = childrenByParent.get(issue.parentKey);
      if (bucket) bucket.push(issue);
      else childrenByParent.set(issue.parentKey, [issue]);
    }
  }
  return issues
    .filter((issue) => !(issue.parentKey && present.has(issue.parentKey)))
    .map((issue) => ({ issue, children: childrenByParent.get(issue.key) ?? [] }));
};
