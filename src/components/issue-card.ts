import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DRAG_MIME, type JiraIssue } from '@/features/jira/types';

/**
 * Presentational issue row. Emits `open-issue` (summary click) and
 * `select-change` (checkbox) so the board orchestrator owns the state.
 */
@customElement('issue-card')
export class IssueCard extends LitElement {
  @property({ attribute: false }) issue!: JiraIssue;
  @property({ type: Boolean, reflect: true }) selected = false;
  @property({ type: Boolean }) selectable = false;

  @state() private dragging = false;

  static override styles = css`
    :host {
      display: block;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.75rem 0.85rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      cursor: grab;
      transition:
        border-color 0.15s,
        transform 0.05s;
    }
    .card:active {
      cursor: grabbing;
    }
    .card.dragging {
      opacity: 0.45;
    }
    :host([selected]) .card {
      border-color: var(--accent);
      box-shadow:
        var(--shadow),
        inset 0 0 0 1px var(--accent);
    }
    input[type='checkbox'] {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
      flex: none;
      cursor: pointer;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
      flex: 1;
    }
    .summary {
      text-align: left;
      background: none;
      border: none;
      font: inherit;
      font-size: 0.9rem;
      color: var(--text);
      cursor: pointer;
      padding: 0;
      min-height: 24px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .summary:hover {
      color: var(--accent);
    }
    .key {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .assignee {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--surface-2);
      flex: none;
      object-fit: cover;
    }
    @media (max-width: 460px) {
      .assignee {
        display: none;
      }
    }
  `;

  override firstUpdated(): void {
    this.draggable = true;
    this.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData(DRAG_MIME, this.issue.key);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      this.dragging = true;
    });
    this.addEventListener('dragend', () => {
      this.dragging = false;
    });
  }

  private onSelect(event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent('select-change', {
        detail: { key: this.issue.key, selected },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onOpen(): void {
    this.dispatchEvent(
      new CustomEvent('open-issue', {
        detail: { key: this.issue.key },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const issue = this.issue;
    return html`
      <div
        class=${this.dragging ? 'card dragging' : 'card'}
        data-testid="issue-card"
        data-issue-key=${issue.key}
        data-status=${issue.status.name}
      >
        ${
          this.selectable
            ? html`<input
              type="checkbox"
              data-testid="issue-select"
              aria-label=${`Select ${issue.key}`}
              .checked=${this.selected}
              @change=${this.onSelect}
            />`
            : nothing
        }
        <div class="body">
          <span class="key">${issue.key}</span>
          <button type="button" class="summary" data-testid="issue-open" @click=${this.onOpen}>
            ${issue.summary}
          </button>
        </div>
        <slot name="actions"></slot>
        ${
          issue.assignee?.avatarUrl
            ? html`<img class="assignee" src=${issue.assignee.avatarUrl} alt=${issue.assignee.displayName} />`
            : nothing
        }
      </div>
    `;
  }
}
