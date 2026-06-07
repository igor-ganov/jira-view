import lit from '@astrojs/lit';
import node from '@astrojs/node';
import { defineConfig, envField } from 'astro/config';

/*
 * POC runtime: Astro SSR on the Node standalone adapter so the OAuth
 * `code → token` exchange (which needs the client secret) runs
 * server-side on plain `astro dev`/`bun`. The reference project ships
 * on Cloudflare Workers; swapping `@astrojs/node` for
 * `@astrojs/cloudflare` is the only adapter change needed to match it
 * (see README → "Deploy to Cloudflare").
 */
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [lit()],
  /*
   * Server secrets are declared here so they are typed and read via
   * `astro:env/server` (never shipped to the client bundle).
   */
  env: {
    schema: {
      JIRA_CLIENT_ID: envField.string({ context: 'server', access: 'secret' }),
      JIRA_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret' }),
      JIRA_REDIRECT_URI: envField.string({ context: 'server', access: 'secret' }),
      JIRA_SCOPES: envField.string({
        context: 'server',
        access: 'secret',
        default: 'read:jira-work read:jira-user offline_access',
      }),
      SESSION_SECRET: envField.string({ context: 'server', access: 'secret' }),
      /*
       * Upstream bases — non-secret config. Default to the real
       * Atlassian hosts; E2E points them at the local mock Jira server.
       */
      JIRA_API_BASE: envField.string({
        context: 'server',
        access: 'public',
        default: 'https://api.atlassian.com',
      }),
      ATLASSIAN_AUTH_BASE: envField.string({
        context: 'server',
        access: 'public',
        default: 'https://auth.atlassian.com',
      }),
      /*
       * When true, the test-only `/test/seed-session` endpoint is
       * enabled so E2E can skip the real OAuth dance. 404 otherwise.
       */
      E2E_TEST_MODE: envField.boolean({
        context: 'server',
        access: 'public',
        default: false,
      }),
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
