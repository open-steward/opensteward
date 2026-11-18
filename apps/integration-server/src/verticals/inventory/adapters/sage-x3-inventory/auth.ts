/**
 * Sage X3 OAuth2 authentication helpers.
 *
 * Sage X3 supports OAuth2 authorization_code flow (for user-delegated access)
 * and client_credentials flow (for server-to-server integrations).  This
 * adapter implements authorization_code with PKCE as that is the flow exposed
 * through the Sage X3 Online developer portal.
 *
 * Token endpoint:   <authServerUrl>/oauth2/token
 * Authorize URL:    <authServerUrl>/oauth2/authorize
 * Scopes:           openid profile (Sage X3 uses OIDC scopes for user context)
 *
 * Credentials extra map:
 *   serverUrl    — base REST URL, e.g. https://tenant.online.sage.com/api1/x3/erp
 *   folder       — X3 folder/endpoint name, e.g. SEED
 *   authServerUrl — OAuth2 server root, e.g. https://tenant.online.sage.com
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import axios from 'axios'

export interface SageX3OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authServerUrl: string
  scopes?: string[]
}

const DEFAULT_SCOPES = ['openid', 'profile']

/** Build the OAuth2 authorization URL for the user-redirect step. */
export function getAuthUrl(
  config: SageX3OAuthConfig,
  state: string,
  scopes?: string[],
): string {
  const scopeList = (scopes ?? config.scopes ?? DEFAULT_SCOPES).join(' ')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopeList,
    state,
  })
  return `${config.authServerUrl.replace(/\/$/, '')}/oauth2/authorize?${params.toString()}`
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(
  config: SageX3OAuthConfig,
  code: string,
  redirectUri: string,
  extra: Record<string, string>,
): Promise<Credentials> {
  const tokenUrl = `${config.authServerUrl.replace(/\/$/, '')}/oauth2/token`
  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    extra: {
      serverUrl: extra['serverUrl'] ?? '',
      folder: extra['folder'] ?? '',
      authServerUrl: config.authServerUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
    },
  }
}

/** Refresh an existing access token using the stored refresh token. */
export async function refreshCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const authServerUrl = String(credentials.extra?.['authServerUrl'] ?? '')
  if (!authServerUrl) return credentials

  const tokenUrl = `${authServerUrl.replace(/\/$/, '')}/oauth2/token`
  try {
    const { data } = await axios.post<{
      access_token: string
      refresh_token?: string
      expires_in?: number
    }>(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: String(credentials.extra?.['clientId'] ?? ''),
        client_secret: String(credentials.extra?.['clientSecret'] ?? ''),
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    return {
      ...credentials,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : credentials.expiresAt,
    }
  } catch {
    return credentials
  }
}

/**
 * credentialFields describes the extra fields needed when an admin sets up
 * the connection without going through the OAuth redirect (e.g. with a
 * pre-issued access token from the Sage X3 administration panel).
 */
export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'serverUrl',
      label: 'REST Server Base URL',
      type: 'text',
      required: true,
      helpText: 'e.g. https://your-tenant.online.sage.com/api1/x3/erp',
    },
    {
      name: 'folder',
      label: 'X3 Folder / Endpoint',
      type: 'text',
      required: true,
      helpText: 'The X3 database folder name, e.g. SEED or LIVE',
    },
    {
      name: 'authServerUrl',
      label: 'OAuth2 Authorization Server URL',
      type: 'text',
      required: true,
      helpText: 'e.g. https://your-tenant.online.sage.com',
    },
    {
      name: 'clientId',
      label: 'OAuth2 Client ID',
      type: 'text',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'OAuth2 Client Secret',
      type: 'password',
      required: true,
    },
  ]
}
