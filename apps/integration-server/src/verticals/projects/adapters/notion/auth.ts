import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

/**
 * Notion's public OAuth flow. The authorize URL takes `client_id`,
 * `redirect_uri`, `response_type=code`, `owner=user` and `state`. Capabilities
 * are configured on the integration itself, so no `scope` param is sent.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  _scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  /** Seconds until expiry. Only present when token rotation is enabled. */
  expires_in?: number
  bot_id?: string
  workspace_id?: string
  workspace_name?: string
  workspace_icon?: string | null
  owner?: { type?: string; user?: { id?: string } }
  duplicated_template_id?: string | null
}

/** Notion authenticates the token endpoint with HTTP Basic `client_id:client_secret`. */
function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

function toCredentials(data: TokenResponse, previous?: Credentials): Credentials {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    // Notion tokens are long-lived; `expires_in` only appears once rotation
    // is enabled. Leave `expiresAt` undefined when absent.
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: previous?.scope,
    extra: {
      userId: data.owner?.user?.id ?? previous?.extra?.['userId'],
      botId: data.bot_id ?? previous?.extra?.['botId'],
      workspaceId: data.workspace_id ?? previous?.extra?.['workspaceId'],
      workspaceName: data.workspace_name ?? previous?.extra?.['workspaceName'],
    },
  }
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/json',
      },
    },
  )
  return toCredentials(data)
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    },
    {
      headers: {
        Authorization: basicAuthHeader(clientId, clientSecret),
        'Content-Type': 'application/json',
      },
    },
  )
  return toCredentials(data, credentials)
}
