import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import {
  PARCEL2GO_AUTH_TOKEN_URL,
  PARCEL2GO_SANDBOX_AUTH_TOKEN_URL,
  PARCEL2GO_SCOPES,
} from './constants'

/**
 * Parcel2Go uses OpenID Connect / OAuth2 with the client_credentials grant.
 *
 * The token endpoint is:
 *   Production:  https://www.parcel2go.com/auth/connect/token
 *   Sandbox:     https://sandbox.parcel2go.com/auth/connect/token
 *
 * Required scopes: "public-api payment"
 */

/**
 * Obtain a client_credentials access token from Parcel2Go.
 * clientId and clientSecret come from the credentials.extra bag (stored at
 * Connect-Link exchange time by the oauth2ClientCredentials template).
 */
export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  sandbox = false,
): Promise<Credentials> {
  const tokenUrl = sandbox ? PARCEL2GO_SANDBOX_AUTH_TOKEN_URL : PARCEL2GO_AUTH_TOKEN_URL

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: PARCEL2GO_SCOPES.join(' '),
  })

  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }>(tokenUrl, body.toString(), {
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
  })

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
    scope: data.scope,
    extra: { clientId, clientSecret, sandbox },
  }
}

/**
 * Refresh credentials by re-running the client_credentials grant.
 * Parcel2Go tokens expire; re-fetching is the correct strategy.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const sandbox = Boolean(credentials.extra?.['sandbox'])

  if (!clientId || !clientSecret) {
    // Cannot refresh without client credentials — return as-is.
    return credentials
  }

  return fetchClientCredentialsToken(clientId, clientSecret, sandbox)
}

/**
 * Build the Authorization header value for Parcel2Go API requests.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
