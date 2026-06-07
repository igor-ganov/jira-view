import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/*
 * Cloudflare production build. Sets DEPLOY_TARGET so astro.config picks the
 * Cloudflare adapter + KV session store. A separate script (rather than an
 * inline env var) keeps it cross-platform on Windows/cmd.
 */
process.env['DEPLOY_TARGET'] = 'cloudflare';
execSync('bunx astro build', { stdio: 'inherit', env: process.env });

/*
 * The adapter emits the worker into dist/_worker.js alongside the static
 * assets. wrangler refuses to upload the worker as a public asset, so tell
 * its asset uploader to ignore the server-side files.
 */
writeFileSync('dist/.assetsignore', '_worker.js\n_routes.json\n');
