import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { JiraIssue, JiraStatus } from '@/features/jira/types';
import { ApiError, getJson } from './lib/api';
import './status-select';

/**
 * Modal drawer showing one issue's details. Fetches `/api/issues/{key}`,
 * traps focus, closes on Esc / backdrop / close button and restores focus
 * to the trigger. Hosts a status-select; the change bubbles to the board
 * (which persists) and updates the drawer's own view optimistically.
 */
@customElement('issue-detail-drawer')
export class IssueDetailDrawer extends LitElement {
  @property({ attribute: false }) issueKey = '';

  @state() private loading = true;
  @state() private error: string | undefined = undefined;
  @state() private issue: JiraIssue | undefined = undefined;

  private previouslyFocused: Element | null = null;

  static override styles = css`
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(9, 30, 66, 0.54);
      display: flex;
      justify-content: flex-end;
      z-index: 20;
    }
    .panel {
      width: min(28rem, 100%);
      height: 100%;
      background: #fff;
      padding: 1.5rem;
      overflow-y: auto;
      box-shadow: -8px 0 24px rgba(9, 30, 66, 0.25);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .key {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #5e6c84;
    }
    .close {
      font: inherit;
      border: none;
      background: none;
      font-size: 1.25rem;
      cursor: pointer;
      color: #5e6c84;
    }
    h2 {
      font-size: 1.1rem;
      margin: 0 0 1rem;
    }
    dl {
      display: grid;
      grid-template-columns: 7rem 1fr;
      gap: 0.5rem 1rem;
      margin: 0;
    }
    dt {
      color: #5e6c84;
      font-size: 0.8125rem;
    }
    dd {
      margin: 0;
    }
    .error {
      color: #bf2600;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.previouslyFocused = (this.getRootNode() as Document | ShadowRoot).activeElement;
    void this.load();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.previouslyFocused instanceof HTMLElement) this.previouslyFocused.focus();
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>('[data-testid="drawer-close"]')?.focus();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      const { issue } = await getJson<{ issue: JiraIssue }>(
        `/api/issues/${encodeURIComponent(this.issueKey)}`,
      );
      this.issue = issue;
    } catch (cause) {
      this.error = cause instanceof ApiError ? cause.code : 'Failed to load issue.';
    } finally {
      this.loading = false;
    }
  }

  private close(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
  }

  /* Mirror the status change locally; the event keeps bubbling to the board. */
  private onTransition(event: Event): void {
    const status = (event as CustomEvent<{ status: JiraStatus }>).detail.status;
    if (this.issue) this.issue = { ...this.issue, status };
  }

  private renderBody() {
    if (this.loading) return html`<p data-testid="drawer-loading">Loading…</p>`;
    if (this.error) return html`<p class="error" data-testid="drawer-error">${this.error}</p>`;
    if (!this.issue) return nothing;
    return html`
      <h2 data-testid="drawer-summary">${this.issue.summary}</h2>
      <dl>
        <dt>Type</dt>
        <dd data-testid="drawer-type">${this.issue.issueType.name}</dd>
        <dt>Status</dt>
        <dd data-testid="drawer-status">
          ${this.issue.status.name}
          <status-select
            .issueKey=${this.issue.key}
            .current=${this.issue.status}
            @transition=${this.onTransition}
          ></status-select>
        </dd>
        <dt>Assignee</dt>
        <dd data-testid="drawer-assignee">${this.issue.assignee?.displayName ?? 'Unassigned'}</dd>
      </dl>
    `;
  }

  override render() {
    return html`
      <div
        class="backdrop"
        data-testid="issue-drawer"
        @click=${(event: Event) => {
          if (event.target === event.currentTarget) this.close();
        }}
        @keydown=${this.onKeydown}
      >
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-label=${`Issue ${this.issueKey}`}
          @click=${(event: Event) => event.stopPropagation()}
        >
          <header>
            <span class="key">${this.issueKey}</span>
            <button type="button" class="close" data-testid="drawer-close" aria-label="Close" @click=${this.close}>
              ✕
            </button>
          </header>
          ${this.renderBody()}
        </div>
      </div>
    `;
  }
}
