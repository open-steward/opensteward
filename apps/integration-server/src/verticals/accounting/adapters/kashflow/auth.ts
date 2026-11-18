/**
 * KashFlow authentication.
 *
 * KashFlow REST API v2 uses a two-step session-token scheme:
 *
 *   Step 1 — POST { UserName, Password } to /sessiontoken
 *             Returns: { TemporaryToken, MemorableWordList, ... }
 *             When the account has no memorable word configured the API may
 *             omit MemorableWordList; in that case TemporaryToken still requires
 *             Step 2 to be exchanged for a proper SessionToken.
 *
 *   Step 2 — PUT { TemporaryToken, MemorableWordList } to /sessiontoken
 *             Returns: { SessionToken, ... }
 *             MemorableWordList must echo back the positions from Step 1 with
 *             the matching characters from the user's memorable word. When the
 *             account has no memorable word configured the list is empty ([]).
 *
 * Only the SessionToken from Step 2 is valid for `Authorization: KfToken <token>`.
 * A TemporaryToken alone CANNOT be used as an auth token.
 *
 * Docs: https://www.kashflow.com/developers/rest-api/sessiontoken/
 *       https://www.kashflow.com/developers/rest-api/authentication/
 */

import axios from 'axios'
import { KASHFLOW_SESSION_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

interface KashFlowStep1Response {
  /** Short-lived temporary token — must be exchanged via Step 2 */
  TemporaryToken?: string
  /** Positions of the memorable word characters to supply in Step 2 */
  MemorableWordList?: Array<{ Position: number; Value: string }>
  [key: string]: unknown
}

interface KashFlowStep2Response {
  /** The usable session token for `Authorization: KfToken <token>` */
  SessionToken?: string
  [key: string]: unknown
}

/**
 * Exchange a username/password pair for a KashFlow session token.
 *
 * Performs the two-step flow:
 *   1. POST { UserName, Password } → TemporaryToken + MemorableWordList
 *   2. PUT  { TemporaryToken, MemorableWordList (echoed back) } → SessionToken
 *
 * Accounts that have no memorable word configured return an empty
 * MemorableWordList in Step 1; Step 2 is still required and the list is echoed
 * back empty.
 */
export async function fetchSessionToken(
  username: string,
  password: string,
): Promise<string> {
  // Step 1: exchange credentials for a temporary token
  const { data: step1 } = await axios.post<KashFlowStep1Response>(
    KASHFLOW_SESSION_URL,
    { UserName: username, Password: password },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (!step1.TemporaryToken) {
    throw new Error('KashFlow: Step 1 did not return a TemporaryToken')
  }

  // Step 2: exchange the temporary token for a real session token.
  // Echo back MemorableWordList exactly as received (empty array when no
  // memorable word is configured).
  const memorableWordList = step1.MemorableWordList ?? []
  const { data: step2 } = await axios.put<KashFlowStep2Response>(
    KASHFLOW_SESSION_URL,
    { TemporaryToken: step1.TemporaryToken, MemorableWordList: memorableWordList },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (!step2.SessionToken) {
    throw new Error('KashFlow: Step 2 did not return a SessionToken')
  }
  return step2.SessionToken
}

/**
 * Build a Credentials object from a raw username+password.
 * The session token is obtained eagerly and stored in accessToken.
 * The username/password are preserved for re-auth on expiry.
 */
export async function exchangeCredentials(
  username: string,
  password: string,
): Promise<Credentials> {
  const token = await fetchSessionToken(username, password)
  return {
    accessToken: token,
    // Store original credentials for refresh
    refreshToken: Buffer.from(`${username}:${password}`).toString('base64'),
  }
}

/** Re-obtain a session token using stored credentials. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) throw new Error('KashFlow: no stored credentials for refresh')
  const decoded = Buffer.from(credentials.refreshToken, 'base64').toString('utf-8')
  const colonIdx = decoded.indexOf(':')
  if (colonIdx === -1) throw new Error('KashFlow: malformed stored credentials')
  const username = decoded.slice(0, colonIdx)
  const password = decoded.slice(colonIdx + 1)
  return exchangeCredentials(username, password)
}
