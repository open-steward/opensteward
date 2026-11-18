import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  LOGIN_PATH,
  LOGIN_SERVER_URL,
  SERVER_DEFINITION_PATH,
  TOKEN_HELP_URL,
} from './constants'

/**
 * Planview AdaptiveWork (Clarizen) authentication.
 *
 * AdaptiveWork has no OAuth2 authorization-code flow and no static API token.
 * Instead a username + password are exchanged at login for a short-lived
 * `sessionId`, which rides in `Authorization: Session <sessionId>` on every
 * subsequent request. Because the org may be hosted in any of several data
 * centers, login is a two-step dance:
 *
 *   1. `getServerDefinition` on the fixed login server resolves the org's
 *      data-center origin (`serverLocation`).
 *   2. `login` on that data center returns the `sessionId`.
 *
 * Credentials are collected through the Connect Link form (the `customForm`
 * helper wired up in `index.ts`): `userName` + `password`. The login is run
 * during `exchangeCredentials`; we persist the resolved `sessionId` as
 * `accessToken`, the data-center origin + the username/password on
 * `credentials.extra`, and re-run login transparently in `refreshCredentials`
 * when the session expires.
 */

interface ServerDefinitionResponse {
  serverLocation?: string
}

interface LoginResponse {
  sessionId?: string
  userId?: string
  organizationId?: string
  licenseType?: string
}

/** Strip a trailing slash so paths can be joined cleanly. */
function trimOrigin(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Resolve the org's data-center origin, then log in there to obtain a session.
 * Returns the `sessionId` plus the resolved base origin and the org/user ids.
 */
export async function login(
  userName: string,
  password: string,
): Promise<{ sessionId: string; baseUrl: string; userId?: string; organizationId?: string }> {
  // 1. Discover the data center for this organization.
  let baseUrl = LOGIN_SERVER_URL
  try {
    const { data } = await axios.post<ServerDefinitionResponse>(
      `${LOGIN_SERVER_URL}${SERVER_DEFINITION_PATH}`,
      { userName, password },
      { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
    )
    if (data?.serverLocation) baseUrl = trimOrigin(data.serverLocation)
  } catch {
    // Fall back to the default login server if discovery is unavailable.
  }

  // 2. Log in on the resolved data center.
  const { data } = await axios.post<LoginResponse>(
    `${baseUrl}${LOGIN_PATH}`,
    { userName, password },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (!data?.sessionId) {
    throw new Error('Planview AdaptiveWork login failed: no sessionId returned.')
  }
  return {
    sessionId: data.sessionId,
    baseUrl,
    userId: data.userId,
    organizationId: data.organizationId,
  }
}

/** Connect Link form has no redirect URL — point users at the API docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for AdaptiveWork. The Connect Link flow calls
 * `exchangeCredentials` (from `customForm`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract and is not part of the live flow.
 */
export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error(
    'Planview AdaptiveWork uses the Connect Link credential form, not an OAuth code exchange.',
  )
}

/**
 * Sessions are short-lived. Re-run the username/password login (stored on
 * `extra`) to obtain a fresh `sessionId`. If the credentials are missing,
 * return the existing ones unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const userName = typeof extra['userName'] === 'string' ? (extra['userName'] as string) : undefined
  const password = typeof extra['password'] === 'string' ? (extra['password'] as string) : undefined
  if (!userName || !password) return credentials

  const { sessionId, baseUrl, userId, organizationId } = await login(userName, password)
  return {
    accessToken: sessionId,
    extra: { ...extra, baseUrl, userId, organizationId },
  }
}
