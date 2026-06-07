# Jira View

A calm, unbreakable alternative to the Jira backlog/board UI. Same stack as the
`prometheus/public-website` reference: **Astro 5 + Lit**, strict TypeScript, Biome.

You log into Jira Cloud via OAuth 2.0 (3LO), open a project, and work its board:

- **Scrum** boards show the **backlog and sprints**; **Kanban** boards show **status columns**.
- **Drag & drop** issues — reorder (rank), move backlog ↔ sprint, or move between Kanban
  columns (which changes status). Keyboard fallback: focus a card, **Alt+↑/↓** to reorder.
- **Change status** from a per-issue dropdown, or **in bulk** — select issues and apply a
  target status to all of them (partial failures are reported per issue).
- **Click an issue** to open a detail drawer (focus-trapped, Esc/backdrop to close).
- Every write is **optimistic with rollback**: the UI updates immediately and reverts with a
  toast if Jira rejects it.

## Architecture

```
Browser (Lit components)  →  Astro SSR /api/* endpoints  →  Jira Cloud REST
                              (hold the OAuth session,        api.atlassian.com
                               keep the token fresh)          /rest/api/3 + /rest/agile/1.0
```

- The OAuth `code → token` exchange needs the **client secret**, so it runs only server-side
  (Astro SSR). A pure static site cannot do real OAuth — hence the Node adapter (Cloudflare
  Workers in production).
- Tokens live **server-side** in Astro's session store (Atlassian access tokens are large JWTs
  that overflow the browser's ~4 KB cookie limit); only a session id is in the cookie. The
  small OAuth `state` (CSRF) is the only value HMAC-signed into a cookie directly.
- `JIRA_API_BASE` / `ATLASSIAN_AUTH_BASE` are configurable so E2E can point the whole stack at a
  local mock Jira. **Note:** these are public `astro:env` vars and are **inlined at build time** —
  a build must run with the same values the server will use.

## Setup

1. **Register an OAuth 2.0 app** at <https://developer.atlassian.com/console/myapps/> →
   *Create* → *OAuth 2.0 integration*.
   - **Permissions** → add **Jira API**. For the full board feature set the granular scopes are:
     ```
     read:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software
     read:issue-details:jira-software write:jira-work write:board-scope:jira-software
     write:sprint:jira-software offline_access
     ```
     (If agile calls return 401 "scope does not match", adjust `JIRA_SCOPES` and re-consent —
     it is env-configurable, no code change.)
   - **Authorization** → *OAuth 2.0 (3LO)* → **Callback URL** `http://localhost:4321/auth/callback`.
   - **Settings** → copy the **Client ID** and **Secret**.

2. **Configure env:**
   ```sh
   cp .env.example .env
   # set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET, SESSION_SECRET, and JIRA_SCOPES (above)
   ```

3. **Run:**
   ```sh
   bun install
   bun run dev      # http://localhost:4321 → Connect Jira → pick a project
   ```

## Scripts

| Script              | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `bun run dev`       | Astro dev server (SSR) on :4321                    |
| `bun run build`     | `astro check` + production build                   |
| `bun run check`     | Type/diagnostics only                              |
| `bun run lint`      | Biome                                              |
| `bun run test`      | Unit tests (Vitest)                                |
| `bun run test:e2e`  | E2E (Playwright) — builds + boots app & mock Jira  |
| `bun run mock-jira` | Run the mock Jira server standalone (:4500)        |

## Testing

- **Unit (Vitest):** session signing, Jira client URL/error mapping, bulk aggregation, and the
  pure Scrum drag-and-drop transforms (`scrum-ops`).
- **E2E (Playwright):** deterministic — a local **mock Jira** (`e2e/mock-jira/`) with in-memory,
  mutable fixtures and error injection replaces the live API; `e2e/serve.ts` builds the app
  (with the E2E env so public vars inline correctly) and serves it; `/test/seed-session` skips
  the real OAuth dance. Network-aware waits (`e2e/toolkit.ts`) — no hard timeouts. Covers board
  rendering, empty states, status (single + bulk + partial failure), DnD (rank / move / column /
  rollback / keyboard), the drawer, and 401 → re-login.

## Project layout (feature-based)

```
src/
  features/
    auth/   oauth.ts (3LO) · session.ts (signed state + token shape)
    jira/   client.ts (REST + JiraApiError) · server.ts (withJira) · board-data.ts ·
            scrum-ops.ts (pure DnD transforms) · types.ts
  pages/
    auth/   login · callback · logout
    api/    projects · projects/[key]/boards · boards/[id]/{scrum,kanban} ·
            issues/[key] · issues/[key]/{transitions,transition} · issues/transition-bulk ·
            rank · sprints/[id]/issues · backlog/issues
    test/   seed-session.ts  (E2E only)
    projects/[projectKey].astro · index.astro
  components/  project-board · issue-card · status-select · bulk-action-bar ·
               issue-detail-drawer · jira-projects · lib/api.ts
  layouts/   base.astro
```

## Deploy to Cloudflare (match the reference)

1. `bun add @astrojs/cloudflare`, swap `node()` → `cloudflare()` in `astro.config.ts`
   (`output: 'server'` stays).
2. Move `.env` values to Worker secrets (`wrangler secret put …`); update the app's callback URL.
3. Back Astro's session storage with Workers KV (the Node filesystem store is dev-only).

## Known shortcuts (intentional, to revisit)

- External JSON is typed via `as` at the fetch boundary — add runtime schema validation.
- Single-site assumption: the first accessible Jira site is used (a site picker is the next step).
- Bulk target statuses are limited to those present on the board (no full-workflow status list yet).
- Keyboard DnD covers in-list reorder; cross-container keyboard moves are a follow-up.
