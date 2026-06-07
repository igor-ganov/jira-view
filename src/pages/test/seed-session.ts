import { E2E_TEST_MODE } from 'astro:env/server';
import type { APIRoute } from 'astro';
import { SESSION_TOKENS_KEY, type StoredTokens } from '@/features/auth/session';

/*
 * Test-only: seed an authenticated session so E2E can skip the real
 * OAuth dance. Disabled (404) unless E2E_TEST_MODE is on, so it can
 * never be reached in a normal deployment.
 */
export const GET: APIRoute = ({ session, redirect }) => {
  if (!E2E_TEST_MODE || !session) return new Response('Not found', { status: 404 });
  const tokens: StoredTokens = {
    accessToken: 'mock-access-token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  session.set(SESSION_TOKENS_KEY, tokens);
  return redirect('/');
};
