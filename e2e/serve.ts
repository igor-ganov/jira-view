import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/*
 * E2E app server: build, then preview — in ONE process so preview never
 * starts before the build finishes (a split build/serve races, leaving a
 * stale SSR bundle in memory). Public astro:env vars are inlined at build
 * time, so the build inherits this process's E2E env (set via Playwright
 * webServer.env). On Windows bun may hit a benign libuv teardown assertion
 * after writing the bundle — we tolerate it and verify the output.
 */
const port = process.env['APP_PORT'] ?? '4327';

try {
  execSync('bunx astro build', { stdio: 'inherit' });
} catch {
  // tolerated — verified below
}
if (!existsSync('dist/server/entry.mjs')) {
  console.error('[serve] astro build did not produce dist/server/entry.mjs');
  process.exit(1);
}

execSync(`bunx astro preview --port ${port}`, { stdio: 'inherit' });
