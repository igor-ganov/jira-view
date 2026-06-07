import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { DRAG_MIME, type JiraIssue, type StatusCategory } from '@/features/jira/types';

const CATEGORY_COLORS: Record<StatusCategory, { bg: string; fg: string }> = {
  new: { bg: '#dfe1e6', fg: '#42526e' },
  indeterminate: { bg: '#deebff', fg: '#0747a6' },
  done: { bg: '#e3fcef', fg: '#006644' },
};

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
      padding: 0.625rem 0.75rem;
      background: #fff;
      border: 1px solid #dfe1e6;
      border-radius: 6px;
    }
    :host([selected]) .card {
      border-color: #0052cc;
      box-shadow: inset 0 0 0 1px #0052cc;
    }
    .card {
      cursor: grab;
    }
    .card.dragging {
      opacity: 0.4;
    }
    .key {
      font-size: 0.75rem;
      font-weight: 600;
      color: #5e6c84;
      white-space: nowrap;
    }
    .summary {
      flex: 1;
      text-align: left;
      background: none;
      border: none;
      font: inherit;
      color: #172b4d;
      cursor: pointer;
      padding: 0;
    }
    .summary:hover {
      text-decoration: underline;
    }
    .badge {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.125rem 0.5rem;
      border-radius: 3px;
      white-space: nowrap;
    }
    .assignee {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #dfe1e6;
    }
    input {
      width: 16px;
      height: 16px;
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
    const color = CATEGORY_COLORS[this.issue.status.category];
    return html`
      <div
        class=${this.dragging ? 'card dragging' : 'card'}
        data-testid="issue-card"
        data-issue-key=${this.issue.key}
        data-status=${this.issue.status.name}
      >
        ${
          this.selectable
            ? html`<input
              type="checkbox"
              data-testid="issue-select"
              aria-label=${`Select ${this.issue.key}`}
              .checked=${this.selected}
              @change=${this.onSelect}
            />`
            : nothing
        }
        <span class="key">${this.issue.key}</span>
        <button type="button" class="summary" data-testid="issue-open" @click=${this.onOpen}>
          ${this.issue.summary}
        </button>
        <slot name="actions"></slot>
        <span
          class="badge"
          data-testid="issue-status"
          style=${`background:${color.bg};color:${color.fg}`}
        >
          ${this.issue.status.name}
        </span>
        ${
          this.issue.assignee?.avatarUrl
            ? html`<img class="assignee" src=${this.issue.assignee.avatarUrl} alt=${this.issue.assignee.displayName} />`
            : html`<span class="assignee" aria-hidden="true"></span>`
        }
      </div>
    `;
  }
}
