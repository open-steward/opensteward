/**
 * Sprinklr Service — OAuth 2.0 Authorization Code helpers.
 *
 * Flow:
 *  1. Direct user to buildAuthUrl() → receives code in redirect.
 *  2. Exchange code via exchangeCode() → access_token + refresh_token.
 *  3. Refresh via refreshCredentials() using stored refresh_token.
 *
 * Two credentials are required per request:
 *   - access_token  (Bearer header)
 *   - api_key       (Key header, stored in extra.apiKey)
 *
 * Docs: https://dev.sprinklr.com/oauth-2-0-for-partners
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL_TEMPLATE,
  OAUTH_TOKEN_URL_TEMPLATE,
  DEFAULT_ENV,
  DEFAULT_SCOPES,
} from './constants'

function resolveUrl(template: string, env: string): string {
  // When env is empty string we strip the trailing slash that would result
  return template.replace('/{env}', env ? `/${env}` : '')
}

/** Fields shown in the credential-setup UI (only api_key is needed for key header) */
export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText: 'Your Sprinklr API key from the Developer Portal (My Account).',
    },
    {
      name: 'env',
      label: 'Environment',
      type: 'text',
      required: false,
      helpText: 'Leave blank for production. Use "sandbox", "prod2", etc. for other environments.',
    },
  ]
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  env: string = DEFAULT_ENV,
): string {
  const effectiveScopes = scopes.length > 0 ? scopes : DEFAULT_SCOPES
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    ...(effectiveScopes.length > 0 ? { scope: effectiveScopes.join(' ') } : {}),
  })
  return `${resolveUrl(OAUTH_AUTHORIZE_URL_TEMPLATE, env)}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  apiKey: string,
  env: string = DEFAULT_ENV,
): Promise<Credentials> {
  const tokenUrl = resolveUrl(OAUTH_TOKEN_URL_TEMPLATE, env)
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  })
  const { data } = await axios.post<TokenResponse>(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    extra: { apiKey, env },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const env = String(credentials.extra?.['env'] ?? DEFAULT_ENV)
  const apiKey = String(credentials.extra?.['apiKey'] ?? '')
  const tokenUrl = resolveUrl(OAUTH_TOKEN_URL_TEMPLATE, env)
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refreshToken,
  })
  const { data } = await axios.post<TokenResponse>(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    extra: { apiKey, env },
  }
}
