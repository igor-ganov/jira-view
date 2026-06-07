/*
 * Browser-side fetch helpers for the Lit components. A 401 means the
 * session is gone, so we bounce to /auth/login (the E2E "session expired"
 * scenario asserts exactly this). Other failures throw a typed ApiError
 * carrying the server's error code + detail for the UI to surface.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(`API ${status}: ${code}`);
    this.name = 'ApiError';
  }
}

type ErrorBody = { readonly error?: string; readonly detail?: string };

const readError = async (response: Response): Promise<ErrorBody> => {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return {};
  }
};

const guard = async (response: Response): Promise<void> => {
  if (response.ok) return;
  const body = await readError(response);
  /*
   * Only OUR session being gone ('unauthenticated') warrants a re-login.
   * A 401 forwarded from Jira ('jira-unauthorized', e.g. a scope mismatch)
   * must surface as an error — redirecting on it causes a login loop.
   */
  if (response.status === 401 && body.error === 'unauthenticated') {
    globalThis.location.assign('/auth/login');
    throw new ApiError(401, 'unauthenticated');
  }
  throw new ApiError(response.status, body.error ?? 'error', body.detail);
};

export const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  await guard(response);
  return (await response.json()) as T;
};

export const sendJson = async <T>(url: string, method: string, payload: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  await guard(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};
