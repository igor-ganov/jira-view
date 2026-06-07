import { describe, expect, it } from 'vitest';
import type { OAuthTokens } from './oauth';
import { sign, toStoredTokens, verify } from './session';

describe('signed cookie helpers', () => {
  it('round-trips a payload through sign/verify', async () => {
    const token = await sign('hello-state-123');
    expect(await verify(token)).toBe('hello-state-123');
  });

  it('rejects a tampered signature', async () => {
    const token = await sign('original');
    const tampered = `${token.split('.')[0]}.deadbeef`;
    expect(await verify(tampered)).toBeUndefined();
  });

  it('rejects a malformed token', async () => {
    expect(await verify('no-dot-here')).toBeUndefined();
    expect(await verify('')).toBeUndefined();
  });
});

describe('toStoredTokens', () => {
  const base: OAuthTokens = {
    access_token: 'at',
    expires_in: 3600,
    scope: 'read:jira-work',
    token_type: 'Bearer',
  };

  it('maps access token and computes an expiry in the future', () => {
    const before = Date.now();
    const stored = toStoredTokens(base);
    expect(stored.accessToken).toBe('at');
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  it('includes the refresh token only when present', () => {
    expect(toStoredTokens(base).refreshToken).toBeUndefined();
    expect(toStoredTokens({ ...base, refresh_token: 'rt' }).refreshToken).toBe('rt');
  });
});
