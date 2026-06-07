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
      bottom: max(1rem, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 25;
      width: max-content;
      max-width: 94vw;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: var(--text);
      color: var(--bg);
      padding: 0.55rem 0.7rem;
      border-radius: 999px;
      box-shadow: var(--shadow-lg);
    }
    .count {
      font-size: 0.8rem;
      font-weight: 650;
      padding-left: 0.4rem;
      white-space: nowrap;
    }
    select,
    button {
      font: inherit;
      font-size: 0.8rem;
      min-height: 36px;
      border-radius: 999px;
      border: none;
      padding: 0.35rem 0.7rem;
      cursor: pointer;
    }
    select {
      background: color-mix(in srgb, var(--bg) 88%, var(--text));
      color: var(--text);
    }
    .apply {
      background: var(--accent);
      color: var(--accent-contrast);
      font-weight: 600;
    }
    .clear {
      background: transparent;
      color: color-mix(in srgb, var(--bg) 70%, var(--text));
    }
    :focus-visible {
      outline: none;
      box-shadow: var(--focus);
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
