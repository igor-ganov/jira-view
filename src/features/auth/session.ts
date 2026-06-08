import { SESSION_SECRET } from 'astro:env/server';
import type { OAuthTokens } from './oauth';

/*
 * Two concerns live here:
 *  1. A tiny HMAC-signed cookie for the OAuth `state` (CSRF) — small,
 *     safe to keep in the browser.
 *  2. The token store shape. Tokens themselves are NOT put in a cookie:
 *     Atlassian access tokens are large JWTs and, together with the
 *     refresh token, blow past the browser's ~4 KB cookie limit, which
 *     makes the browser silently drop the cookie. They are stored
 *     server-side via Astro's session API (filesystem in dev); only a
 *     session id travels in the cookie.
 */
export const OAUTH_STATE_COOKIE = 'jv_oauth_state';
export const SESSION_TOKENS_KEY = 'jiraTokens';

export type StoredTokens = {
  readonly accessToken: string;
  readonly refreshToken?: string;
  /** Epoch ms at which the access token expires. */
  readonly expiresAt: number;
  /** Space-separated scopes actually granted to this token. */
  readonly scope?: string;
};

/** Normalize an OAuth token response into what we persist in the session. */
export const toStoredTokens = (tokens: OAuthTokens): StoredTokens => ({
  accessToken: tokens.access_token,
  ...(tokens.refresh_token === undefined ? {} : { refreshToken: tokens.refresh_token }),
  ...(tokens.scope === undefined ? {} : { scope: tokens.scope }),
  expiresAt: Date.now() + tokens.expires_in * 1000,
});

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const importKey = (): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

/** Sign a short string, returning `payload.signature` (both base64url). */
export const sign = async (payload: string): Promise<string> => {
  const key = await importKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${toBase64Url(encoder.encode(payload))}.${toBase64Url(signature)}`;
};

/** Verify a `payload.signature` token; returns the payload string or undefined. */
export const verify = async (token: string): Promise<string | undefined> => {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return undefined;
  const payload = atob(encodedPayload.replaceAll('-', '+').replaceAll('_', '/'));
  const key = await importKey();
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  if (toBase64Url(expected) !== encodedSignature) return undefined;
  return payload;
};
