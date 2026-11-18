/**
 * NHN Commerce (Godomall / Shopby) OAuth2 helpers.
 *
 * Shopby's authentication model:
 *  - The `clientId` identifies the mall (not a registered OAuth app).
 *  - Member access tokens are issued by POST /oauth/token with the member's
 *    username + password. Tokens are valid for 12 h by default.
 *  - Social/OpenID logins use /oauth/begin → provider → /oauth/callback, but
 *    these are storefront flows handled outside this adapter.
 *
 * For server-to-server integration the credentials are:
 *   { clientId, memberId, memberPassword } stored on the connection, and
 *   `accessToken` is the short-lived bearer token used as the `accessToken`
 *   header on every API call.
 *
 * Since the Shopby shop API does not expose a conventional OAuth2
 * authorization-code grant for third-party apps, `getAuthUrl` is
 * informational (points at the mall admin) and `exchangeCode` issues a
 * member token directly with clientId + memberId + password.
 *
 * Docs: https://docs.shopby.co.kr/?url.primaryName=auth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, API_VERSION, DEFAULT_PLATFORM, TOKEN_PATH } from './constants'

interface ShopbyTokenResponse {
  accessToken: string
  expireIn?: number
}

/**
 * Build an informational URL pointing at the Shopby admin panel for this mall.
 * `clientId` is a required query param that identifies the mall.
 */
export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    clientId,
    redirect_uri: redirectUri,
    state,
  })
  return `${BASE_URL}/oauth/begin?${params.toString()}`
}

/**
 * Exchange a Shopby member credentials (memberId + password) for an access
 * token. The `code` argument is interpreted as `memberId:password` (colon
 * separated) to fit the OpenSteward code-exchange contract.
 *
 * The returned `accessToken` is valid for ~12 h. Set `expiresAt` so the
 * shared `isTokenExpired` helper can detect expiry.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
): Promise<Credentials> {
  // code = "<memberId>:<password>" (caller encodes this)
  const colonIdx = code.indexOf(':')
  const memberId = colonIdx >= 0 ? code.slice(0, colonIdx) : code
  const password = colonIdx >= 0 ? code.slice(colonIdx + 1) : ''

  const { data } = await axios.post<ShopbyTokenResponse>(
    `${BASE_URL}${TOKEN_PATH}`,
    { memberId, password, keepLogin: false },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Version: API_VERSION,
        clientId,
        platform: DEFAULT_PLATFORM,
      },
    },
  )

  const expireIn = data.expireIn ?? 43200 // 12 h default
  return {
    accessToken: data.accessToken,
    expiresAt: new Date(Date.now() + expireIn * 1000),
    // Store clientId, memberId and password so refreshToken can re-issue.
    extra: { clientId, memberId, password },
  }
}

/**
 * Refresh a member token by re-issuing with stored memberId + password.
 * The adapter stores them in `credentials.extra` at `exchangeCode` time.
 * If no stored credentials, returns the existing token unchanged.
 */
export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra as Record<string, unknown> | undefined
  const memberId = extra?.['memberId'] as string | undefined
  const password = extra?.['password'] as string | undefined
  const clientId = extra?.['clientId'] as string | undefined

  if (!memberId || !password || !clientId) {
    // Cannot refresh without stored credentials — return as-is.
    return credentials
  }

  const code = `${memberId}:${password}`
  return exchangeCode(code, clientId)
}
