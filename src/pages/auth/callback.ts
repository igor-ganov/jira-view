import type { APIRoute } from 'astro';
import { exchangeCodeForTokens } from '@/features/auth/oauth';
import {
  OAUTH_STATE_COOKIE,
  SESSION_TOKENS_KEY,
  toStoredTokens,
  verify,
} from '@/features/auth/session';

/** OAuth redirect target: validate `state`, swap `code` for tokens, store session. */
export const GET: APIRoute = async ({ url, cookies, redirect, session }) => {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const stateCookie = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });

  const expectedState = stateCookie ? await verify(stateCookie) : undefined;
  if (!code || !returnedState || returnedState !== expectedState) {
    return new Response('OAuth state mismatch or missing code', { status: 400 });
  }
  if (!session) {
    return new Response('Session store unavailable', { status: 500 });
  }

  const tokens = await exchangeCodeForTokens(code);
  session.set(SESSION_TOKENS_KEY, toStoredTokens(tokens));
  return redirect('/');
};
