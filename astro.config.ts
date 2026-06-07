import cloudflare from '@astrojs/cloudflare';
import lit from '@astrojs/lit';
import node from '@astrojs/node';
import { defineConfig, envField } from 'astro/config';

/*
 * Astro SSR — the OAuth `code → token` exchange (needs the client secret),
 * the session store, and the Jira proxy all run server-side.
 *
 * Adapter is chosen by DEPLOY_TARGET so local dev/tests stay on the Node
 * standalone adapter (filesystem session store) while production builds
 * for Cloudflare Workers. On Cloudflare the session lives in a Workers KV
 * namespace bound as `SESSION` (see wrangler.jsonc).
 */
const useCloudflare = process.env['DEPLOY_TARGET'] === 'cloudflare';

export default defineConfig({
  output: 'server',
  adapter: useCloudflare ? cloudflare() : node({ mode: 'standalone' }),
  ...(useCloudflare
    ? { session: { driver: 'cloudflare-kv-binding', options: { binding: 'SESSION' } } }
    : {}),
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
