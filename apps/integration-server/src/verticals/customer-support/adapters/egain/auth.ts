/**
 * eGain OAuth2 authentication helpers.
 *
 * eGain uses per-tenant OAuth2 endpoints hosted at:
 *   https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/{authorize|token}
 *
 * The tenant ID and the customer's eGain host are collected on the Connect
 * page (`oauthFields`) before the redirect, used for the authorize URL and the
 * token exchange, and stored in `credentials.extra`. Both are validated: the
 * tenant ID is spliced into the OAuth path and the host receives the bearer
 * token, so neither may be anything else.
 *
 * Docs: https://apidev.egain.com/developer-portal/get-started/authentication_guide
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL_TEMPLATE,
  OAUTH_TOKEN_URL_TEMPLATE,
  DEFAULT_SCOPES,
} from './constants'

export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'tenantId',
      label: 'eGain tenant ID',
      type: 'text',
      required: true,
      placeholder: 'ACMECORP123456',
      helpText:
        'The tenant identifier from your eGain instance. ' +
        'Found in the Administrator Console under OAuth2 client application settings.',
    },
    {
      name: 'tenantHost',
      label: 'eGain host',
      type: 'text',
      required: true,
      placeholder: 'acme.egain.cloud',
      helpText: 'Your eGain instance hostname, e.g. acme.egain.cloud.',
    },
  ]
}

/** Trimmed tenant ID; letters and digits only, since it is spliced into the OAuth path. */
export function normaliseTenantId(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '').trim()
  if (!value) throw new Error('eGain tenant ID is required.')
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    throw new Error('eGain tenant ID must contain only letters and digits.')
  }
  return value
}

const EGAIN_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.egain\.cloud$/

/** `acme.egain.cloud` or a pasted `https://Acme.eGain.cloud/system` → `acme.egain.cloud`. */
export function normaliseTenantHost(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#:].*$/, '')
  if (!value) throw new Error('eGain host is required (e.g. acme.egain.cloud).')
  if (!EGAIN_HOST.test(value)) throw new Error('eGain host must be an *.egain.cloud host.')
  return value
}

function resolveUrl(template: string, tenantId: string): string {
  return template.replace('{tenantId}', tenantId)
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  tenantId: string | undefined,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${resolveUrl(OAUTH_AUTHORIZE_URL_TEMPLATE, normaliseTenantId(tenantId))}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  tenantId: string | undefined,
  tenantHost: string | undefined,
): Promise<Credentials> {
  const tenant = normaliseTenantId(tenantId)
  const host = normaliseTenantHost(tenantHost)
  const tokenUrl = resolveUrl(OAUTH_TOKEN_URL_TEMPLATE, tenant)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope ?? DEFAULT_SCOPES.join(' '),
    extra: { tenantId: tenant, tenantHost: host, clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = String(credentials.extra?.['clientId'] ?? '')
  const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')

  if (!credentials.refreshToken) {
    // eGain access tokens are long-lived; return as-is if no refresh token.
    return credentials
  }
  const tenantId = normaliseTenantId(credentials.extra?.['tenantId'])
  const tokenUrl = resolveUrl(OAUTH_TOKEN_URL_TEMPLATE, tenantId)
  const { data } = await axios.post<TokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}
