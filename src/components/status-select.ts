import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { JiraStatus, JiraTransition } from '@/features/jira/types';
import { getJson } from './lib/api';

/**
 * Accessible status changer: a native <select> whose available
 * transitions are fetched lazily on first focus (avoids one request per
 * card on board load). Emits `transition` with the resolved target status
 * so the board can apply an optimistic update.
 */
@customElement('status-select')
export class StatusSelect extends LitElement {
  @property({ attribute: false }) issueKey = '';
  @property({ attribute: false }) current!: JiraStatus;

  @state() private transitions: readonly JiraTransition[] = [];
  @state() private loaded = false;

  static override styles = css`
    select {
      font: inherit;
      font-size: 0.72rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      min-height: 30px;
      padding: 0.2rem 0.45rem;
      border: none;
      border-radius: 999px;
      max-width: 9rem;
      cursor: pointer;
      background: var(--cat-new-bg);
      color: var(--cat-new-fg);
    }
    select.cat-indeterminate {
      background: var(--cat-prog-bg);
      color: var(--cat-prog-fg);
    }
    select.cat-done {
      background: var(--cat-done-bg);
      color: var(--cat-done-fg);
    }
    select:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    option {
      text-transform: none;
      font-weight: 500;
      color: var(--text);
      background: var(--surface);
    }
  `;

  private async ensureTransitions(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const { transitions } = await getJson<{ transitions: readonly JiraTransition[] }>(
        `/api/issues/${encodeURIComponent(this.issueKey)}/transitions`,
      );
      this.transitions = transitions;
    } catch {
      this.loaded = false;
    }
  }

  private onChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const transition = this.transitions.find((candidate) => candidate.id === select.value);
    select.value = '';
    if (!transition) return;
    this.dispatchEvent(
      new CustomEvent('transition', {
        detail: {
          key: this.issueKey,
          transitionId: transition.id,
          status: {
            id: transition.toStatusId,
            name: transition.toStatusName,
            category: transition.toStatusCategory,
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <select
        class="cat-${this.current.category}"
        data-testid="status-select"
        data-current=${this.current.name}
        aria-label=${`Change status of ${this.issueKey}`}
        @focusin=${this.ensureTransitions}
        @change=${this.onChange}
      >
        <option value="" selected>${this.current.name}</option>
        ${this.transitions.map(
          (transition) => html`
            <option value=${transition.id} data-to=${transition.toStatusName}>
              → ${transition.toStatusName}
            </option>
          `,
        )}
      </select>
    `;
  }
}
