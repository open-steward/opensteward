/**
 * Help Scout OAuth 2.0, Authorization Code flow ("typically used for
 * integrations to be used by other Help Scout users"). There are no API keys,
 * and Help Scout documents no scopes: an app acts as the user who authorized
 * it. https://developer.helpscout.com/mailbox-api/overview/authentication/
 *
 * What the docs show, and so all this sends:
 *   - authorize: `client_id` and the optional `state`. No `redirect_uri`
 *     ("we will redirect them back to the Redirection URL that is defined in
 *     My Apps"), no `response_type`, no `scope`.
 *   - exchange: form fields `code`, `client_id`, `client_secret`,
 *     `grant_type=authorization_code` (curl `--data`, i.e. form-encoded; the
 *     client authenticates with its id and secret in the body).
 *   - refresh: form fields `refresh_token`, `client_id`, `client_secret`,
 *     `grant_type=refresh_token`, answered with "a new access and refresh
 *     token pair".
 *   - response: `refresh_token`, `token_type`, `access_token`, `expires_in`
 *     (172800 in the examples).
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(clientId: string, state: string): string {
  const params = new URLSearchParams({ client_id: clientId, state })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

const FORM = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }

function toCredentials(data: TokenResponse, previous?: Credentials): Credentials {
  if (!data?.access_token) throw new Error('helpscout: token response carried no access_token')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    ...(typeof data.expires_in === 'number'
      ? { expiresAt: new Date(Date.now() + data.expires_in * 1000) }
      : {}),
    extra: previous?.extra ?? {},
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
    }).toString(),
    FORM,
  )
  return toCredentials(data)
}

/**
 * "When the access token expires (indicated by HTTP 401 return code), you can
 * use the refresh token to retrieve a new access and refresh token pair". The
 * pair rotates, so the new refresh token replaces the old one.
 */
export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error('helpscout: no refresh token on this connection; reconnect it')
  }
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
    FORM,
  )
  return toCredentials(data, credentials)
}
