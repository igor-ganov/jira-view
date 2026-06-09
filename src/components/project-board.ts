import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { KanbanBoardData, ScrumBoardData } from '@/features/jira/board-data';
import { groupByParent, type IssueGroup } from '@/features/jira/grouping';
import { type Container, locate, moveIssue, reorderBefore } from '@/features/jira/scrum-ops';
import { DRAG_MIME, type JiraBoard, type JiraIssue, type JiraStatus } from '@/features/jira/types';
import type { BulkResult } from '@/pages/api/issues/transition-bulk';
import { ApiError, getJson, sendJson } from './lib/api';
import './issue-card';
import './status-select';
import './bulk-action-bar';
import './issue-detail-drawer';

type Toast = { readonly id: number; readonly text: string; readonly tone: 'error' | 'info' };
type TransitionDetail = {
  readonly key: string;
  readonly transitionId: string;
  readonly status: JiraStatus;
};
type DropContainer =
  | { readonly type: 'backlog' }
  | { readonly type: 'sprint'; readonly sprintId: number }
  | { readonly type: 'board' };

const sameContainer = (a: Container | undefined, b: Container | undefined): boolean => {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind !== 'sprint' || a.sprintId === (b.kind === 'sprint' ? b.sprintId : -1);
};

const apiErrorText = (cause: unknown): string => {
  if (cause instanceof ApiError) {
    if (cause.code === 'jira-forbidden' || cause.code === 'jira-unauthorized') {
      const scopes = cause.info.requiredScopes?.join(', ');
      return `Jira blocked ${cause.info.path ?? 'the request'}${scopes ? ` — needs: ${scopes}` : ''}.`;
    }
    if (cause.code === 'jira-conflict') return 'Conflict — the board changed; please retry.';
    return `Request failed (${cause.status}).`;
  }
  return 'Something went wrong.';
};

/**
 * Board orchestrator: resolves the project's boards, lets the user pick
 * one, and renders the Scrum view (backlog + sprints) or Kanban view
 * (status columns). Read-only in this phase; status/DnD wire in later.
 */
@customElement('project-board')
export class ProjectBoard extends LitElement {
  @property({ attribute: 'project-key' }) projectKey = '';

  @state() private loading = true;
  @state() private error: string | undefined = undefined;
  @state() private boards: readonly JiraBoard[] = [];
  @state() private board: JiraBoard | undefined = undefined;
  @state() private scrum: ScrumBoardData | undefined = undefined;
  @state() private kanban: KanbanBoardData | undefined = undefined;
  @state() private toasts: readonly Toast[] = [];
  @state() private selectedKeys: readonly string[] = [];
  @state() private openIssueKey: string | undefined = undefined;
  @state() private collapsed: ReadonlySet<string> = new Set();
  @state() private collapsedSections: ReadonlySet<string> = new Set(['past-sprints']);

  private toastSeq = 0;

  static override styles = css`
    :host {
      display: block;
    }
    .picker {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .picker button {
      font: inherit;
      font-size: 0.875rem;
      padding: 0.45rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      transition:
        background 0.15s,
        border-color 0.15s,
        color 0.15s;
    }
    .picker button:hover {
      border-color: var(--accent);
    }
    .picker button[aria-pressed='true'] {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--accent-contrast);
    }
    .picker button:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    section {
      margin-bottom: 1.75rem;
    }
    h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
      font-weight: 650;
      letter-spacing: 0.01em;
      margin: 0 0 0.75rem;
      color: var(--text);
    }
    .count {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      background: var(--surface-2);
      border-radius: 999px;
      padding: 0.05rem 0.5rem;
    }
    .goal {
      font-size: 0.8125rem;
      color: var(--text-muted);
      font-weight: 400;
    }
    .list {
      display: grid;
      /* Cap the column at the container width — without this the implicit
         'auto' column grows to the widest card's content (long summary /
         status name), so lists with longer content rendered wider. */
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
      min-height: 0.5rem;
    }
    .group {
      display: grid;
      gap: 0.5rem;
    }
    .parent-row {
      display: grid;
      grid-template-columns: 1.4rem minmax(0, 1fr);
      align-items: center;
      gap: 0.35rem;
    }
    .chevron,
    .chevron-spacer {
      width: 1.4rem;
      height: 1.4rem;
    }
    .chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: var(--surface-2);
      color: var(--text-muted);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.7rem;
      position: relative;
      transition: transform 0.15s;
    }
    .chevron.open {
      transform: rotate(90deg);
    }
    .chevron .kids {
      position: absolute;
      top: -5px;
      right: -5px;
      background: var(--accent);
      color: var(--accent-contrast);
      font-size: 0.55rem;
      font-weight: 700;
      min-width: 13px;
      height: 13px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 3px;
    }
    .chevron:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    .subtasks {
      display: grid;
      gap: 0.5rem;
      margin-left: 1.75rem;
      padding-left: 0.85rem;
      border-left: 2px solid var(--border);
    }
    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 1rem;
    }
    .tool {
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.35rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text-muted);
      cursor: pointer;
    }
    .tool:hover {
      border-color: var(--accent);
      color: var(--text);
    }
    .tool:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    .section-head {
      align-items: center;
    }
    .section-chevron {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-muted);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.7rem;
      transition: transform 0.15s;
    }
    .section-chevron.open {
      transform: rotate(90deg);
    }
    .section-chevron:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    [data-testid='past-sprints'] {
      background: var(--surface-2);
      border-radius: var(--radius);
      padding: 0.5rem 0.85rem 0.25rem;
    }
    .empty {
      color: var(--text-muted);
      font-size: 0.875rem;
      padding: 0.75rem 0.25rem;
    }
    .error {
      color: var(--danger);
      background: var(--danger-soft);
      border: 1px solid var(--danger);
      border-radius: var(--radius);
      padding: 1rem 1.1rem;
      line-height: 1.6;
      font-size: 0.875rem;
      white-space: pre-line;
      word-break: break-word;
    }
    .skeleton {
      color: var(--text-muted);
      padding: 1rem 0.25rem;
    }
    .toasts {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      bottom: max(1rem, env(safe-area-inset-bottom));
      display: grid;
      gap: 0.5rem;
      z-index: 30;
      width: min(92vw, 26rem);
    }
    .toast {
      padding: 0.7rem 0.95rem;
      border-radius: var(--radius);
      font-size: 0.85rem;
      color: #fff;
      box-shadow: var(--shadow-lg);
    }
    .toast.error {
      background: var(--danger);
    }
    .toast.info {
      background: var(--text);
      color: var(--bg);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadBoards();
  }

  private get selectedBoardIdFromUrl(): number | undefined {
    const raw = new URL(globalThis.location.href).searchParams.get('board');
    return raw ? Number(raw) : undefined;
  }

  /* `client:only` does not reliably forward the attribute, so fall back to
   * the URL (/projects/{key}) — the single source of truth anyway. */
  private resolveProjectKey(): string {
    if (this.projectKey) return this.projectKey;
    const match = globalThis.location.pathname.match(/\/projects\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  }

  private async loadBoards(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      const { boards } = await getJson<{ boards: readonly JiraBoard[] }>(
        `/api/projects/${encodeURIComponent(this.resolveProjectKey())}/boards`,
      );
      this.boards = boards;
      const wanted = this.selectedBoardIdFromUrl;
      const board = boards.find((b) => b.id === wanted) ?? boards[0];
      if (!board) {
        this.loading = false;
        return;
      }
      await this.selectBoard(board);
    } catch (cause) {
      this.fail(cause);
    }
  }

  private async selectBoard(board: JiraBoard): Promise<void> {
    this.loading = true;
    this.error = undefined;
    this.board = board;
    this.scrum = undefined;
    this.kanban = undefined;
    const url = new URL(globalThis.location.href);
    url.searchParams.set('board', String(board.id));
    globalThis.history.replaceState(undefined, '', url);
    try {
      if (board.type === 'scrum') {
        this.scrum = await getJson<ScrumBoardData>(`/api/boards/${board.id}/scrum`);
      } else {
        this.kanban = await getJson<KanbanBoardData>(`/api/boards/${board.id}/kanban`);
      }
      /* Start with every sub-task group collapsed. */
      this.collapsed = this.collapsibleParentKeys();
    } catch (cause) {
      this.fail(cause);
    } finally {
      this.loading = false;
    }
  }

  /** Keys of issues that have at least one sub-task present in their list. */
  private collapsibleParentKeys(): ReadonlySet<string> {
    const issues = this.allIssues();
    const keys = new Set(issues.map((issue) => issue.key));
    const parents = new Set<string>();
    for (const issue of issues) {
      if (issue.parentKey && keys.has(issue.parentKey)) parents.add(issue.parentKey);
    }
    return parents;
  }

  private toggleAllGroups(): void {
    this.collapsed = this.collapsed.size > 0 ? new Set() : this.collapsibleParentKeys();
  }

  private fail(cause: unknown): void {
    this.loading = false;
    if (!(cause instanceof ApiError)) {
      this.error = 'Failed to load the board.';
      return;
    }
    const scopeProblem = cause.code === 'jira-forbidden' || cause.code === 'jira-unauthorized';
    if (!scopeProblem) {
      this.error = `${cause.code}${cause.detail ? `: ${cause.detail}` : ''}`;
      return;
    }
    const { path, requiredScopes, missingScopes, scopeHint } = cause.info;
    const missing =
      missingScopes && missingScopes.length > 0 ? missingScopes.join('  ') : undefined;
    const required =
      requiredScopes && requiredScopes.length > 0 ? requiredScopes.join('  ') : undefined;
    this.error = [
      `Jira rejected  ${path ?? 'the request'}  (${cause.status}).`,
      missing
        ? `Your token is MISSING: ${missing}`
        : required
          ? `This endpoint requires: ${required}`
          : undefined,
      missing
        ? 'Add it in the Atlassian app (Permissions → Jira API → Granular scopes), then Log out and Connect Jira again — new scopes only apply to a fresh token.'
        : 'If those scopes are already added, Log out and Connect Jira again — your current token predates them.',
      scopeHint ? `Jira hint: ${scopeHint}` : undefined,
      cause.detail ? `Jira said: ${cause.detail}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private findIssue(key: string): JiraIssue | undefined {
    if (this.scrum) {
      const inBacklog = this.scrum.backlog.find((issue) => issue.key === key);
      if (inBacklog) return inBacklog;
      for (const sprint of this.scrum.sprints) {
        const found = sprint.issues.find((issue) => issue.key === key);
        if (found) return found;
      }
    }
    return this.kanban?.issues.find((issue) => issue.key === key);
  }

  /** Replace one issue everywhere it appears, triggering a re-render. */
  private patchIssue(key: string, patch: Partial<JiraIssue>): void {
    const apply = (issue: JiraIssue): JiraIssue =>
      issue.key === key ? { ...issue, ...patch } : issue;
    if (this.scrum) {
      this.scrum = {
        backlog: this.scrum.backlog.map(apply),
        sprints: this.scrum.sprints.map((sprint) => ({
          ...sprint,
          issues: sprint.issues.map(apply),
        })),
      };
    }
    if (this.kanban) this.kanban = { ...this.kanban, issues: this.kanban.issues.map(apply) };
  }

  private pushToast(text: string, tone: 'error' | 'info' = 'error'): void {
    this.toastSeq += 1;
    const id = this.toastSeq;
    this.toasts = [...this.toasts, { id, text, tone }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
    }, 6000);
  }

  /** Optimistically apply a status change; roll back and toast on failure. */
  private async onTransition(event: Event): Promise<void> {
    const { key, transitionId, status } = (event as CustomEvent<TransitionDetail>).detail;
    const previous = this.findIssue(key)?.status;
    if (!previous) return;
    this.patchIssue(key, { status });
    try {
      await sendJson(`/api/issues/${encodeURIComponent(key)}/transition`, 'POST', { transitionId });
    } catch (cause) {
      this.patchIssue(key, { status: previous });
      this.pushToast(apiErrorText(cause));
    }
  }

  private allIssues(): readonly JiraIssue[] {
    if (this.scrum) {
      return [...this.scrum.backlog, ...this.scrum.sprints.flatMap((sprint) => sprint.issues)];
    }
    return this.kanban?.issues ?? [];
  }

  /** Distinct statuses present on the board, keyed by name (for bulk targets). */
  private statusesByName(): ReadonlyMap<string, JiraStatus> {
    const map = new Map<string, JiraStatus>();
    for (const issue of this.allIssues()) map.set(issue.status.name, issue.status);
    return map;
  }

  private onSelectChange(event: Event): void {
    const { key, selected } = (event as CustomEvent<{ key: string; selected: boolean }>).detail;
    this.selectedKeys = selected
      ? [...this.selectedKeys, key]
      : this.selectedKeys.filter((candidate) => candidate !== key);
  }

  private clearSelection(): void {
    this.selectedKeys = [];
  }

  /** Optimistically transition every selected issue; roll back only those that fail. */
  private async applyBulk(toStatusName: string): Promise<void> {
    const target = this.statusesByName().get(toStatusName);
    const keys = this.selectedKeys;
    if (!target || keys.length === 0) return;
    const previous = new Map(keys.map((key) => [key, this.findIssue(key)?.status]));
    for (const key of keys) this.patchIssue(key, { status: target });
    this.clearSelection();
    try {
      const { results } = await sendJson<{ results: readonly BulkResult[] }>(
        '/api/issues/transition-bulk',
        'POST',
        { keys, toStatusName },
      );
      const failed = results.filter((result) => !result.ok);
      for (const result of failed) {
        const prior = previous.get(result.key);
        if (prior) this.patchIssue(result.key, { status: prior });
      }
      const okCount = results.length - failed.length;
      this.pushToast(
        failed.length === 0
          ? `${okCount} issue(s) updated.`
          : `${okCount} updated, ${failed.length} failed.`,
        failed.length === 0 ? 'info' : 'error',
      );
    } catch (cause) {
      for (const key of keys) {
        const prior = previous.get(key);
        if (prior) this.patchIssue(key, { status: prior });
      }
      this.pushToast(apiErrorText(cause));
    }
  }

  private async runOptimistic(applyLocal: () => void, persist: () => Promise<void>): Promise<void> {
    const snapScrum = this.scrum;
    const snapKanban = this.kanban;
    applyLocal();
    try {
      await persist();
    } catch (cause) {
      this.scrum = snapScrum;
      this.kanban = snapKanban;
      this.pushToast(apiErrorText(cause));
    }
  }

  private allowDrop(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }

  private onDrop(event: DragEvent, container: DropContainer, anchorKey?: string): void {
    const sourceKey = event.dataTransfer?.getData(DRAG_MIME);
    if (!sourceKey) return;
    event.preventDefault();
    event.stopPropagation();
    const cleanAnchor = anchorKey === sourceKey ? undefined : anchorKey;
    if (container.type === 'board') {
      void this.handleBoardReorder(sourceKey, cleanAnchor);
      return;
    }
    const to: Container =
      container.type === 'backlog'
        ? { kind: 'backlog' }
        : { kind: 'sprint', sprintId: container.sprintId };
    void this.handleScrumDrop(sourceKey, cleanAnchor, to);
  }

  /** Reorder a flat (Kanban) task list and persist the new rank. */
  private async handleBoardReorder(key: string, anchorKey: string | undefined): Promise<void> {
    if (!this.kanban) return;
    const issues = this.kanban.issues.filter((issue) => issue.key !== key);
    const moved = this.kanban.issues.find((issue) => issue.key === key);
    if (!moved) return;
    const at = anchorKey ? issues.findIndex((issue) => issue.key === anchorKey) : issues.length;
    const index = at < 0 ? issues.length : at;
    await this.runOptimistic(
      () => {
        if (this.kanban) {
          this.kanban = {
            issues: [...issues.slice(0, index), moved, ...issues.slice(index)],
          };
        }
      },
      () =>
        sendJson(
          '/api/rank',
          'POST',
          anchorKey
            ? { issues: [key], before: anchorKey }
            : { issues: [key], after: issues.at(-1)?.key },
        ),
    );
  }

  private async handleScrumDrop(
    key: string,
    anchorKey: string | undefined,
    to: Container,
  ): Promise<void> {
    if (!this.scrum) return;
    const from = locate(this.scrum, key);
    const dest = anchorKey ? (locate(this.scrum, anchorKey) ?? to) : to;
    const needMove = !sameContainer(from, dest);
    await this.runOptimistic(
      () => {
        if (anchorKey && this.scrum) this.scrum = reorderBefore(this.scrum, key, anchorKey);
        else if (this.scrum) this.scrum = moveIssue(this.scrum, key, to);
      },
      async () => {
        if (needMove) {
          if (dest.kind === 'sprint') {
            await sendJson(`/api/sprints/${dest.sprintId}/issues`, 'POST', { issues: [key] });
          } else {
            await sendJson('/api/backlog/issues', 'POST', { issues: [key] });
          }
        }
        if (anchorKey) await sendJson('/api/rank', 'POST', { issues: [key], before: anchorKey });
      },
    );
  }

  private async refocus(key: string): Promise<void> {
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>(`issue-card[data-issue-key="${key}"]`)?.focus();
  }

  /* Keyboard fallback for reordering within a Scrum list (Alt+Arrow). */
  private onKeydown(event: KeyboardEvent): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const host = event
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && node.hasAttribute('data-issue-key'),
      );
    const key = host?.getAttribute('data-issue-key') ?? undefined;
    if (!key || !this.scrum) return;
    const container = locate(this.scrum, key);
    if (!container) return;
    const list =
      container.kind === 'backlog'
        ? this.scrum.backlog
        : (this.scrum.sprints.find((entry) => entry.sprint.id === container.sprintId)?.issues ??
          []);
    const index = list.findIndex((issue) => issue.key === key);
    event.preventDefault();
    if (event.key === 'ArrowUp' && index > 0) {
      const before = list[index - 1]?.key;
      if (before) void this.keyboardRank(key, { before }, before);
    } else if (event.key === 'ArrowDown' && index < list.length - 1) {
      const after = list[index + 1]?.key;
      const before = list[index + 2]?.key;
      if (after) void this.keyboardRank(key, { after }, before, container);
    }
  }

  private async keyboardRank(
    key: string,
    anchor: { readonly before: string } | { readonly after: string },
    beforeKey: string | undefined,
    container?: Container,
  ): Promise<void> {
    await this.runOptimistic(
      () => {
        if (!this.scrum) return;
        this.scrum =
          beforeKey !== undefined
            ? reorderBefore(this.scrum, key, beforeKey)
            : container
              ? moveIssue(this.scrum, key, container)
              : this.scrum;
      },
      () => sendJson('/api/rank', 'POST', { issues: [key], ...anchor }),
    );
    void this.refocus(key);
  }

  private renderToolbar() {
    const total = this.collapsibleParentKeys().size;
    if (total === 0) return nothing;
    const anyCollapsed = this.collapsed.size > 0;
    return html`
      <div class="toolbar">
        <button type="button" class="tool" data-testid="toggle-all" @click=${this.toggleAllGroups}>
          ${anyCollapsed ? `⊕ Expand all (${total})` : `⊖ Collapse all (${total})`}
        </button>
      </div>
    `;
  }

  private renderPicker() {
    if (this.boards.length < 2) return nothing;
    return html`
      <div class="picker" data-testid="board-picker" role="group" aria-label="Boards">
        ${this.boards.map(
          (board) => html`
            <button
              type="button"
              data-testid="board-option"
              data-board-id=${board.id}
              aria-pressed=${board.id === this.board?.id}
              @click=${() => this.selectBoard(board)}
            >
              ${board.name}
            </button>
          `,
        )}
      </div>
    `;
  }

  private renderCard(issue: JiraIssue, container: DropContainer, compact = false) {
    return html`
      <issue-card
        data-issue-key=${issue.key}
        tabindex="0"
        .issue=${issue}
        selectable
        ?compact=${compact}
        .selected=${this.selectedKeys.includes(issue.key)}
        @dragover=${this.allowDrop}
        @drop=${(event: DragEvent) => this.onDrop(event, container, issue.key)}
      >
        <status-select slot="actions" .issueKey=${issue.key} .current=${issue.status}></status-select>
      </issue-card>
    `;
  }

  private renderGroup(group: IssueGroup, container: DropContainer) {
    const { issue, children } = group;
    const collapsed = this.collapsed.has(issue.key);
    return html`
      <div class="group" data-testid="issue-group" data-parent-key=${issue.key}>
        <div class="parent-row">
          ${children.length > 0
            ? html`<button
                type="button"
                class=${collapsed ? 'chevron' : 'chevron open'}
                data-testid="group-toggle"
                aria-expanded=${!collapsed}
                aria-label=${`${collapsed ? 'Expand' : 'Collapse'} ${children.length} sub-task(s) of ${issue.key}`}
                @click=${() => this.toggleCollapse(issue.key)}
              >
                ▸<span class="kids">${children.length}</span>
              </button>`
            : html`<span class="chevron-spacer"></span>`}
          ${this.renderCard(issue, container)}
        </div>
        ${children.length > 0 && !collapsed
          ? html`<div class="subtasks" data-testid="subtasks">
              ${children.map((child) => this.renderCard(child, container, true))}
            </div>`
          : nothing}
      </div>
    `;
  }

  private toggleCollapse(key: string): void {
    const next = new Set(this.collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsed = next;
  }

  private renderList(issues: readonly JiraIssue[], container: DropContainer) {
    const sprintId = container.type === 'sprint' ? String(container.sprintId) : undefined;
    return html`<div
      class="list"
      data-drop-container
      data-container-type=${container.type}
      data-sprint-id=${ifDefined(sprintId)}
      @dragover=${this.allowDrop}
      @drop=${(event: DragEvent) => this.onDrop(event, container)}
    >
      ${issues.length === 0 ? html`<p class="empty" data-testid="empty">No issues.</p>` : nothing}
      ${groupByParent(issues).map((group) => this.renderGroup(group, container))}
    </div>`;
  }

  private toggleSection(key: string): void {
    const next = new Set(this.collapsedSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsedSections = next;
  }

  private renderSprintSection(entry: ScrumBoardData['sprints'][number]) {
    return html`
      <section data-testid="sprint-section" data-sprint-id=${entry.sprint.id}>
        <h2>
          ${entry.sprint.name}
          ${entry.sprint.goal ? html`<span class="goal">${entry.sprint.goal}</span>` : nothing}
          <span class="count">${entry.issues.length}</span>
        </h2>
        ${this.renderList(entry.issues, { type: 'sprint', sprintId: entry.sprint.id })}
      </section>
    `;
  }

  private renderPastSprints(closed: readonly ScrumBoardData['sprints'][number][]) {
    const collapsed = this.collapsedSections.has('past-sprints');
    return html`
      <section data-testid="past-sprints">
        <h2 class="section-head">
          <button
            type="button"
            class=${collapsed ? 'section-chevron' : 'section-chevron open'}
            data-testid="past-sprints-toggle"
            aria-expanded=${!collapsed}
            aria-label=${`${collapsed ? 'Expand' : 'Collapse'} past sprints`}
            @click=${() => this.toggleSection('past-sprints')}
          >
            ▸
          </button>
          Past sprints <span class="count">${closed.length}</span>
        </h2>
        ${collapsed ? nothing : closed.map((entry) => this.renderSprintSection(entry))}
      </section>
    `;
  }

  private renderScrum(data: ScrumBoardData) {
    const closed = data.sprints.filter((entry) => entry.sprint.state === 'closed');
    const active = data.sprints.filter((entry) => entry.sprint.state === 'active');
    const future = data.sprints.filter((entry) => entry.sprint.state === 'future');
    return html`
      ${closed.length > 0 ? this.renderPastSprints(closed) : nothing}
      ${active.map((entry) => this.renderSprintSection(entry))}
      ${future.map((entry) => this.renderSprintSection(entry))}
      <section data-testid="backlog-section">
        <h2>Backlog <span class="count">${data.backlog.length}</span></h2>
        ${this.renderList(data.backlog, { type: 'backlog' })}
      </section>
    `;
  }

  private renderKanban(data: KanbanBoardData) {
    return html`
      <section data-testid="board-section">
        <h2>Tasks <span class="count">${data.issues.length}</span></h2>
        ${this.renderList(data.issues, { type: 'board' })}
      </section>
    `;
  }

  private renderToasts() {
    return html`
      <div class="toasts" data-testid="toasts" aria-live="polite">
        ${this.toasts.map(
          (toast) =>
            html`<div class="toast ${toast.tone}" data-testid="toast" role="status">${toast.text}</div>`,
        )}
      </div>
    `;
  }

  override render() {
    if (this.error) return html`<p class="error" data-testid="board-error">${this.error}</p>`;
    if (this.loading && !this.board)
      return html`<p class="skeleton" data-testid="board-loading">Loading board…</p>`;
    return html`
      <div
        @transition=${this.onTransition}
        @select-change=${this.onSelectChange}
        @keydown=${this.onKeydown}
        @open-issue=${(event: Event) => {
          this.openIssueKey = (event as CustomEvent<{ key: string }>).detail.key;
        }}
        @bulk-apply=${(event: Event) =>
          this.applyBulk((event as CustomEvent<{ toStatusName: string }>).detail.toStatusName)}
        @bulk-clear=${this.clearSelection}
      >
        <div>
          ${this.renderPicker()} ${this.renderToolbar()}
          ${this.scrum ? this.renderScrum(this.scrum) : nothing}
          ${this.kanban ? this.renderKanban(this.kanban) : nothing}
          ${this.loading ? html`<p class="skeleton" data-testid="board-loading">Loading…</p>` : nothing}
        </div>
        ${
          this.selectedKeys.length > 0
            ? html`<bulk-action-bar
              .count=${this.selectedKeys.length}
              .statuses=${[...this.statusesByName().keys()]}
            ></bulk-action-bar>`
            : nothing
        }
        ${
          this.openIssueKey
            ? html`<issue-detail-drawer
              .issueKey=${this.openIssueKey}
              @close=${() => {
                this.openIssueKey = undefined;
              }}
            ></issue-detail-drawer>`
            : nothing
        }
      </div>
      ${this.renderToasts()}
    `;
  }
}
