import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { JiraProject } from '@/features/jira/client';

type ProjectsResponse = {
  readonly projects: readonly JiraProject[];
};

/**
 * Client-only Lit element that proves the round-trip: it calls the
 * server `/api/projects` endpoint (which uses the OAuth session cookie)
 * and renders the authenticated user's Jira projects.
 */
@customElement('jira-projects')
export class JiraProjects extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font: inherit;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.6rem;
    }
    li {
      display: flex;
    }
    a {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      flex: 1;
      min-height: 56px;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
      text-decoration: none;
      transition:
        border-color 0.15s,
        transform 0.05s;
    }
    a:hover {
      border-color: var(--accent);
    }
    a:active {
      transform: scale(0.99);
    }
    a:focus-visible {
      outline: none;
      box-shadow: var(--focus);
    }
    img {
      width: 28px;
      height: 28px;
      border-radius: 7px;
    }
    .key {
      font-weight: 700;
      font-size: 0.78rem;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .type {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: capitalize;
      background: var(--surface-2);
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
    }
    .error {
      color: var(--danger);
    }
  `;

  @state() private loading = true;
  @state() private error: string | undefined = undefined;
  @state() private data: ProjectsResponse | undefined = undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.data = (await response.json()) as ProjectsResponse;
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : 'Failed to load projects';
    } finally {
      this.loading = false;
    }
  }

  override render() {
    if (this.loading) return html`<p>Loading projects…</p>`;
    if (this.error) return html`<p class="error">Error: ${this.error}</p>`;
    if (!this.data) return nothing;
    if (this.data.projects.length === 0) {
      return html`<p data-testid="projects-empty">No projects found.</p>`;
    }
    return html`
      <ul data-testid="projects-list">
        ${this.data.projects.map(
          (project) => html`
            <li>
              <a href="/projects/${project.key}" data-testid="project-link" data-project-key=${project.key}>
                ${
                  project.avatarUrls?.['24x24']
                    ? html`<img src=${project.avatarUrls['24x24']} alt="" />`
                    : nothing
                }
                <span class="key">${project.key}</span>
                <span>${project.name}</span>
                <span class="type">${project.projectTypeKey}</span>
              </a>
            </li>
          `,
        )}
      </ul>
    `;
  }
}
