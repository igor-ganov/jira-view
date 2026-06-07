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
      background: color-mix(in srgb, #0b0e13 55%, transparent);
      display: flex;
      justify-content: flex-end;
      z-index: 40;
    }
    .panel {
      width: min(30rem, 100%);
      height: 100%;
      background: var(--surface);
      color: var(--text);
      padding: 1.5rem max(1.25rem, env(safe-area-inset-right)) 2rem 1.25rem;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      animation: slide-in 0.2s ease;
    }
    @keyframes slide-in {
      from {
        transform: translateX(2rem);
        opacity: 0;
      }
    }
    @media (max-width: 560px) {
      .backdrop {
        align-items: flex-end;
      }
      .panel {
        width: 100%;
        height: auto;
        max-height: 88vh;
        border-radius: var(--radius) var(--radius) 0 0;
        animation: slide-up 0.22s ease;
      }
      @keyframes slide-up {
        from {
          transform: translateY(2rem);
          opacity: 0;
        }
      }
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.1rem;
    }
    .key {
      font-size: 0.8rem;
      font-weight: 650;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .close {
      font: inherit;
      border: none;
      background: var(--surface-2);
      width: 40px;
      height: 40px;
      border-radius: 999px;
      font-size: 1.1rem;
      cursor: pointer;
      color: var(--text);
    }
    .close:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    h2 {
      font-size: 1.2rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0 0 1.25rem;
    }
    dl {
      display: grid;
      grid-template-columns: 7rem 1fr;
      gap: 0.85rem 1rem;
      margin: 0;
      align-items: center;
    }
    dt {
      color: var(--text-muted);
      font-size: 0.82rem;
    }
    dd {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .error {
      color: var(--danger);
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
