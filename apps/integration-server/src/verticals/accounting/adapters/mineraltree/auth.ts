/**
 * MineralTree auth helpers.
 *
 * MineralTree uses session-token auth, not OAuth.  The Connect Link form
 * collects the user's credentials (username + password + optional base URL)
 * and calls `exchangeCredentials`, which POSTs to the login endpoint and
 * stores the returned session token as `accessToken`.
 *
 * Because there is no OAuth redirect flow, `getAuthUrl` and `exchangeCode`
 * return/throw stubs that are never reached at runtime.
 *
 * The session token lives in the `If-Match` header on every subsequent
 * request; `accessToken` stores that token.
 */

import axios from 'axios'
import { MINERALTREE_API_BASE_DEFAULT, MINERALTREE_LOGIN_PATH } from './constants'
import type { Credentials } from '../../adapter/interface'

/** Perform a session-token login and return credentials. */
export async function loginWithCredentials(
  username: string,
  password: string,
  companyId: string,
  baseUrl: string,
): Promise<Credentials> {
  // The Authorization header uses the format "MT <companyId>:<username>:<password>" (base64)
  const raw = Buffer.from(`${companyId}:${username}:${password}`).toString('base64')
  const res = await axios.post<Record<string, unknown>>(
    `${baseUrl}${MINERALTREE_LOGIN_PATH}`,
    null,
    {
      headers: {
        Authorization: `MT ${raw}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      validateStatus: (s) => s < 500,
    },
  )
  // MineralTree returns the session artifact in the ETag header
  const sessionToken = (res.headers as Record<string, string>)['etag'] ?? ''
  if (!sessionToken) {
    throw new Error('MineralTree login failed: no session token in ETag header')
  }
  return {
    accessToken: sessionToken,
    extra: { baseUrl, companyId },
  }
}

// Stub — MineralTree has no OAuth redirect flow
export function getAuthUrl(_state: string): string {
  return MINERALTREE_API_BASE_DEFAULT
}

// Stub — credentials are exchanged via loginWithCredentials, not OAuth codes
export async function exchangeCode(_code: string): Promise<Credentials> {
  return { accessToken: _code }
}

// MineralTree session tokens do not auto-refresh via a token endpoint;
// callers should re-login to obtain a fresh token.
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
