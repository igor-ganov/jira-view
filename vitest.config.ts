import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/*
 * Unit-test config. `astro:env/server` is a build-time virtual module, so
 * it is aliased to a static stub. `@` mirrors the app's source alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      'astro:env/server': fileURLToPath(
        new URL('./test/stubs/astro-env-server.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
