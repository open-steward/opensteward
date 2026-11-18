/**
 * iQmetrix auth — OAuth 2.0 resource-owner password grant.
 *
 * iQmetrix does not expose a public authorization-code flow for third-party
 * apps.  Partners authenticate with credentials (client_id, client_secret,
 * username, password) obtained from the iQmetrix onboarding package.
 *
 * Token endpoint: POST https://accountsrc.iqmetrix.net/v1/oauth2/token
 * Access tokens expire in ~12 h (43 199 s); refresh via refresh_token grant.
 * CompanyId (integer) is required for every company-scoped API call and is
 * stored in Credentials.extra.companyId.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId',     label: 'Client ID',      type: 'text',     required: true },
    { name: 'clientSecret', label: 'Client Secret',   type: 'password', required: true },
    { name: 'username',     label: 'Username',         type: 'text',     required: true },
    { name: 'password',     label: 'Password',         type: 'password', required: true },
    { name: 'companyId',    label: 'Company ID',       type: 'text',     required: true,
      helpText: 'Integer CompanyId from your iQmetrix onboarding package.' },
  ]
}

async function fetchToken(params: URLSearchParams): Promise<TokenResponse> {
  const { data } = await axios.post<TokenResponse>(TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  })
  return data
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { clientId, clientSecret, username, password, companyId } = fields
  if (!clientId || !clientSecret || !username || !password || !companyId) {
    throw new Error('iqmetrix: clientId, clientSecret, username, password and companyId are all required')
  }
  const data = await fetchToken(new URLSearchParams({
    grant_type:    'password',
    client_id:     clientId,
    client_secret: clientSecret,
    username,
    password,
  }))
  const expiresAt = typeof data.expires_in === 'number'
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: { clientId, clientSecret, companyId },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId     = String(credentials.extra?.['clientId']     ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
  const companyId    = String(credentials.extra?.['companyId']    ?? '')
  const refreshToken = credentials.refreshToken
  if (!refreshToken || !clientId || !clientSecret) return credentials

  const data = await fetchToken(new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }))
  const expiresAt = typeof data.expires_in === 'number'
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined
  return {
    ...credentials,
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    extra: { clientId, clientSecret, companyId },
  }
}
