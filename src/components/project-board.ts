import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { KanbanBoardData, ScrumBoardData } from '@/features/jira/board-data';
import { type Container, locate, moveIssue, reorderBefore } from '@/features/jira/scrum-ops';
import { DRAG_MIME, type JiraBoard, type JiraIssue, type JiraStatus } from '@/features/jira/types';
import type { BulkResult } from '@/pages/api/issues/transition-bulk';
import { ApiError, getJson, sendJson } from './lib/api';
import './issue-card';
import './status-select';
import './bulk-action-bar';
import './issue-detail-drawer';

type ColumnGroup = { readonly name: string; readonly issues: readonly JiraIssue[] };
type Toast = { readonly id: number; readonly text: string; readonly tone: 'error' | 'info' };
type TransitionDetail = {
  readonly key: string;
  readonly transitionId: string;
  readonly status: JiraStatus;
};
type DropContainer =
  | { readonly type: 'backlog' }
  | { readonly type: 'sprint'; readonly sprintId: number }
  | { readonly type: 'column'; readonly statusName: string };

const sameContainer = (a: Container | undefined, b: Container | undefined): boolean => {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind !== 'sprint' || a.sprintId === (b.kind === 'sprint' ? b.sprintId : -1);
};

const apiErrorText = (cause: unknown): string => {
  if (cause instanceof ApiError) {
    if (cause.code === 'jira-forbidden') {
      return 'Missing Jira scopes — update JIRA_SCOPES and re-consent.';
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

  private toastSeq = 0;

  static override styles = css`
    :host {
      display: block;
    }
    .picker {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .picker button {
      font: inherit;
      padding: 0.35rem 0.75rem;
      border: 1px solid #dfe1e6;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .picker button[aria-pressed='true'] {
      background: #0052cc;
      border-color: #0052cc;
      color: #fff;
    }
    h2 {
      font-size: 1rem;
      margin: 1.5rem 0 0.75rem;
    }
    .goal {
      font-size: 0.8125rem;
      color: #5e6c84;
      font-weight: 400;
      margin-left: 0.5rem;
    }
    .list {
      display: grid;
      gap: 0.5rem;
    }
    .empty {
      color: #5e6c84;
      font-size: 0.875rem;
      padding: 0.5rem 0;
    }
    .columns {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(220px, 1fr);
      gap: 0.75rem;
      align-items: start;
      overflow-x: auto;
    }
    .column {
      background: #f4f5f7;
      border-radius: 8px;
      padding: 0.5rem;
    }
    .column h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #5e6c84;
      margin: 0.25rem 0.25rem 0.5rem;
    }
    .error {
      color: #bf2600;
    }
    .toasts {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      display: grid;
      gap: 0.5rem;
      z-index: 10;
    }
    .toast {
      max-width: 22rem;
      padding: 0.6rem 0.85rem;
      border-radius: 6px;
      font-size: 0.8125rem;
      color: #fff;
      box-shadow: 0 4px 12px rgba(9, 30, 66, 0.25);
    }
    .toast.error {
      background: #bf2600;
    }
    .toast.info {
      background: #172b4d;
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
    } catch (cause) {
      this.fail(cause);
    } finally {
      this.loading = false;
    }
  }

  private fail(cause: unknown): void {
    this.loading = false;
    this.error =
      cause instanceof ApiError
        ? cause.code === 'jira-forbidden'
          ? 'Your Jira app is missing the required scopes. Update JIRA_SCOPES and re-consent.'
          : `${cause.code}${cause.detail ? `: ${cause.detail}` : ''}`
        : 'Failed to load the board.';
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
    if (container.type === 'column') {
      void this.handleKanbanDrop(sourceKey, container.statusName);
      return;
    }
    const to: Container =
      container.type === 'backlog'
        ? { kind: 'backlog' }
        : { kind: 'sprint', sprintId: container.sprintId };
    void this.handleScrumDrop(sourceKey, anchorKey === sourceKey ? undefined : anchorKey, to);
  }

  private async handleKanbanDrop(key: string, statusName: string): Promise<void> {
    const issue = this.findIssue(key);
    if (!this.kanban || !issue || issue.status.name === statusName) return;
    const column = this.kanban.columns.find((candidate) => candidate.name === statusName);
    const target: JiraStatus = {
      id: column?.statusIds[0] ?? issue.status.id,
      name: statusName,
      category: this.statusesByName().get(statusName)?.category ?? issue.status.category,
    };
    await this.runOptimistic(
      () => this.patchIssue(key, { status: target }),
      async () => {
        const { results } = await sendJson<{ results: readonly BulkResult[] }>(
          '/api/issues/transition-bulk',
          'POST',
          { keys: [key], toStatusName: statusName },
        );
        if (!results[0]?.ok) throw new Error('move-failed');
      },
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

  private groupColumns(data: KanbanBoardData): readonly ColumnGroup[] {
    return data.columns.map((column) => ({
      name: column.name,
      issues: data.issues.filter((issue) => column.statusIds.includes(issue.status.id)),
    }));
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

  private renderList(issues: readonly JiraIssue[], container: DropContainer) {
    const sprintId = container.type === 'sprint' ? String(container.sprintId) : undefined;
    const statusName = container.type === 'column' ? container.statusName : undefined;
    return html`<div
      class="list"
      data-drop-container
      data-container-type=${container.type}
      data-sprint-id=${ifDefined(sprintId)}
      data-status-name=${ifDefined(statusName)}
      @dragover=${this.allowDrop}
      @drop=${(event: DragEvent) => this.onDrop(event, container)}
    >
      ${issues.length === 0 ? html`<p class="empty" data-testid="empty">No issues.</p>` : nothing}
      ${issues.map(
        (issue) => html`
          <issue-card
            data-issue-key=${issue.key}
            tabindex="0"
            .issue=${issue}
            selectable
            .selected=${this.selectedKeys.includes(issue.key)}
            @dragover=${this.allowDrop}
            @drop=${(event: DragEvent) => this.onDrop(event, container, issue.key)}
          >
            <status-select slot="actions" .issueKey=${issue.key} .current=${issue.status}></status-select>
          </issue-card>
        `,
      )}
    </div>`;
  }

  private renderScrum(data: ScrumBoardData) {
    return html`
      <section data-testid="backlog-section">
        <h2>Backlog</h2>
        ${this.renderList(data.backlog, { type: 'backlog' })}
      </section>
      ${data.sprints.map(
        (entry) => html`
          <section data-testid="sprint-section" data-sprint-id=${entry.sprint.id}>
            <h2>
              ${entry.sprint.name}
              ${entry.sprint.goal ? html`<span class="goal">${entry.sprint.goal}</span>` : nothing}
            </h2>
            ${this.renderList(entry.issues, { type: 'sprint', sprintId: entry.sprint.id })}
          </section>
        `,
      )}
    `;
  }

  private renderKanban(data: KanbanBoardData) {
    return html`
      <div class="columns" data-testid="board-columns">
        ${this.groupColumns(data).map(
          (column) => html`
            <div class="column" data-testid="board-column" data-column-name=${column.name}>
              <h3>${column.name}</h3>
              ${this.renderList(column.issues, { type: 'column', statusName: column.name })}
            </div>
          `,
        )}
      </div>
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
    if (this.loading && !this.board) return html`<p data-testid="board-loading">Loading board…</p>`;
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
          ${this.renderPicker()}
          ${this.scrum ? this.renderScrum(this.scrum) : nothing}
          ${this.kanban ? this.renderKanban(this.kanban) : nothing}
          ${this.loading ? html`<p data-testid="board-loading">Loading…</p>` : nothing}
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
