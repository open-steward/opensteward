/**
 * Jira Service Management OAuth 2.0 (3LO) auth helpers.
 *
 * Flow:
 *  1. Redirect user to buildAuthUrl()
 *  2. User authorises; Atlassian redirects back with ?code=
 *  3. exchangeCode() trades code for access_token + refresh_token
 *  4. After exchangeCode(), call fetchCloudId() to resolve the cloudId
 *     and store it in credentials.extra.cloudId.
 *  5. refreshAccessToken() rotates the token using the refresh_token.
 *
 * Docs: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  ACCESSIBLE_RESOURCES_URL,
  DEFAULT_SCOPES,
} from './constants'

/** No static credential fields — auth is entirely OAuth 2.0. */
export function credentialFields(): CredentialField[] {
  return []
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface AtlassianTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

interface AccessibleResource {
  id: string
  name: string
  url: string
  scopes: string[]
  avatarUrl?: string
}

/**
 * Fetch the cloudId for the first (or specified) accessible Atlassian site.
 * Returns empty string if the call fails — callers should treat empty cloudId
 * as a configuration error.
 */
export async function fetchCloudId(
  accessToken: string,
  siteName?: string,
): Promise<string> {
  try {
    const { data } = await axios.get<AccessibleResource[]>(
      ACCESSIBLE_RESOURCES_URL,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
    )
    if (!Array.isArray(data) || data.length === 0) return ''
    if (siteName) {
      const match = data.find((r) => r.name === siteName || r.url.includes(siteName))
      if (match) return match.id
    }
    return data[0]?.id ?? ''
  } catch {
    return ''
  }
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<AtlassianTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const cloudId = await fetchCloudId(data.access_token)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    extra: { cloudId },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<AtlassianTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  }
}

export { DEFAULT_SCOPES }
