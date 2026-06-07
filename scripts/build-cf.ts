import { execSync } from 'node:child_process';

/*
 * Cloudflare production build. Sets DEPLOY_TARGET so astro.config picks the
 * Cloudflare adapter + KV session store. A separate script (rather than an
 * inline env var) keeps it cross-platform on Windows/cmd.
 */
process.env['DEPLOY_TARGET'] = 'cloudflare';
execSync('bunx astro build', { stdio: 'inherit', env: process.env });
