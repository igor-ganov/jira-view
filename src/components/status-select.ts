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
      font-size: 0.75rem;
      padding: 0.2rem 0.4rem;
      border: 1px solid #dfe1e6;
      border-radius: 4px;
      background: #fff;
      color: #172b4d;
      max-width: 9rem;
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
        data-testid="status-select"
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
