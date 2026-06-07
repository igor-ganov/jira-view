import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

/**
 * Floating bar shown while issues are selected. Presentational: emits
 * `bulk-apply` (with the chosen target status name) and `bulk-clear`;
 * the board owns the selection and performs the writes.
 */
@customElement('bulk-action-bar')
export class BulkActionBar extends LitElement {
  @property({ type: Number }) count = 0;
  @property({ attribute: false }) statuses: readonly string[] = [];

  @query('select') private select!: HTMLSelectElement;

  static override styles = css`
    :host {
      position: fixed;
      left: 50%;
      bottom: 1.25rem;
      transform: translateX(-50%);
      z-index: 9;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #172b4d;
      color: #fff;
      padding: 0.6rem 0.9rem;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(9, 30, 66, 0.35);
    }
    .count {
      font-size: 0.8125rem;
      font-weight: 600;
    }
    select,
    button {
      font: inherit;
      font-size: 0.8125rem;
      border-radius: 6px;
      border: none;
      padding: 0.35rem 0.6rem;
    }
    button {
      cursor: pointer;
    }
    .apply {
      background: #0052cc;
      color: #fff;
    }
    .clear {
      background: transparent;
      color: #b3bac5;
    }
  `;

  private apply(): void {
    const toStatusName = this.select.value;
    if (!toStatusName) return;
    this.dispatchEvent(
      new CustomEvent('bulk-apply', { detail: { toStatusName }, bubbles: true, composed: true }),
    );
  }

  private clear(): void {
    this.dispatchEvent(new CustomEvent('bulk-clear', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <div class="bar" data-testid="bulk-bar" role="region" aria-label="Bulk actions">
        <span class="count" data-testid="bulk-count">${this.count} selected</span>
        <select data-testid="bulk-status" aria-label="Bulk target status">
          <option value="">Set status…</option>
          ${this.statuses.map((name) => html`<option value=${name}>${name}</option>`)}
        </select>
        <button type="button" class="apply" data-testid="bulk-apply" @click=${this.apply}>Apply</button>
        <button type="button" class="clear" data-testid="bulk-clear" @click=${this.clear}>Clear</button>
      </div>
    `;
  }
}
