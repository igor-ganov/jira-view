import type { APIRoute } from 'astro';
import { buildAuthorizeUrl } from '@/features/auth/oauth';
import { OAUTH_STATE_COOKIE, sign } from '@/features/auth/session';

/** Start the OAuth dance: stash a signed `state` and bounce to Atlassian. */
export const GET: APIRoute = async ({ cookies, redirect }) => {
  const state = crypto.randomUUID();
  cookies.set(OAUTH_STATE_COOKIE, await sign(state), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return redirect(buildAuthorizeUrl(state));
};
