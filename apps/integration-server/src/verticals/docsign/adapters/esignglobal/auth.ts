/**
 * eSignGlobal (eSign.AI) auth helpers.
 *
 * eSignGlobal is an API-key platform: an App ID + Secret Key (created under
 * Settings > Integration > Apps) are exchanged for a short-lived access
 * token via the `client_credentials` grant. The token is valid for 24h and
 * is presented as `Authorization: Bearer <token>` on every request. There
 * is no interactive OAuth redirect, so the OAuth methods throw — credentials
 * are collected through the Connect Link flow (`credentialFields()` +
 * `exchangeCredentials()`).
 *
 * The customer also picks the data centre (region) their account lives in.
 * The resolved host + the App ID/Secret are stored on `credentials.extra`
 * so the token can be re-minted on refresh without re-prompting.
 *
 * Docs: https://www.esign.ai/en-US/developer-center/api (oAuth Authorization)
 */

import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  ACCESS_TOKEN_PATH,
  DEFAULT_BASE_URL,
  PRODUCTION_BASE_URLS,
  SANDBOX_BASE_URL,
} from './constants'

export function buildAuthUrl(): string {
  throw new Error(
    'eSignGlobal does not support interactive OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'eSignGlobal does not support interactive OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

/** Map the customer-picked environment to an API host. */
function resolveBaseUrl(environment: string | undefined): string {
  switch (environment) {
    case 'sandbox':
      return SANDBOX_BASE_URL
    case 'hk':
      return PRODUCTION_BASE_URLS.hk
    case 'sg':
      return PRODUCTION_BASE_URLS.sg
    case 'eu':
      return PRODUCTION_BASE_URLS.eu
    default:
      return DEFAULT_BASE_URL
  }
}

interface AccessTokenResponse {
  access_token: string
  /** Seconds until the token expires. */
  expires_in?: number
  scope?: string
  token_type?: string
  refresh_token?: string
}

/**
 * Exchange App ID + Secret Key for an access token via the
 * `client_credentials` grant. eSignGlobal requires the parameters be sent as
 * `multipart/form-data` form fields.
 */
async function mintAccessToken(
  appId: string,
  appSecret: string,
  baseUrl: string,
): Promise<AccessTokenResponse> {
  const form = new FormData()
  form.append('client_id', appId)
  form.append('client_secret', appSecret)
  form.append('grant_type', 'client_credentials')
  const { data } = await axios.post<AccessTokenResponse>(`${baseUrl}${ACCESS_TOKEN_PATH}`, form, {
    headers: { Accept: 'application/json' },
  })
  return data
}

export function esignglobalCredentialFields(): CredentialField[] {
  return [
    {
      name: 'appId',
      label: 'App ID',
      type: 'text',
      required: true,
      placeholder: 'eSignGlobal App ID',
      helpText:
        'Create an application under Settings > Integration > Apps in eSignGlobal. Sent as client_id to mint the access token.',
    },
    {
      name: 'appSecret',
      label: 'Secret Key',
      type: 'password',
      required: true,
      placeholder: 'eSignGlobal Secret Key',
      helpText:
        'The Secret Key from the App Details page (Settings > Integration > Apps > App Details). Sent as client_secret.',
    },
    {
      name: 'environment',
      label: 'Data centre',
      type: 'select',
      required: true,
      helpText: 'Pick the eSignGlobal data centre your account is hosted in.',
      options: [
        { value: 'hk', label: 'Production — Hong Kong' },
        { value: 'sg', label: 'Production — Singapore' },
        { value: 'eu', label: 'Production — EU (Frankfurt)' },
        { value: 'sandbox', label: 'Sandbox (SML)' },
      ],
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appId = (fields.appId ?? '').trim()
  const appSecret = (fields.appSecret ?? '').trim()
  const environment = (fields.environment ?? 'hk').trim()
  if (!appId || !appSecret) {
    throw new Error('eSignGlobal App ID and Secret Key are required.')
  }
  const baseUrl = resolveBaseUrl(environment)
  const token = await mintAccessToken(appId, appSecret, baseUrl)
  return {
    accessToken: token.access_token,
    scope: token.scope,
    expiresAt:
      typeof token.expires_in === 'number'
        ? new Date(Date.now() + token.expires_in * 1000)
        : undefined,
    extra: { appId, appSecret, environment, baseUrl },
  }
}

/**
 * Re-mint the access token from the stored App ID + Secret Key. The token is
 * short-lived (24h) and the client_credentials grant returns no
 * refresh_token, so refresh repeats the original exchange.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const appId = String(credentials.extra?.['appId'] ?? '')
  const appSecret = String(credentials.extra?.['appSecret'] ?? '')
  const environment = String(credentials.extra?.['environment'] ?? 'hk')
  if (!appId || !appSecret) return credentials
  const baseUrl = resolveBaseUrl(environment)
  const token = await mintAccessToken(appId, appSecret, baseUrl)
  return {
    accessToken: token.access_token,
    scope: token.scope,
    expiresAt:
      typeof token.expires_in === 'number'
        ? new Date(Date.now() + token.expires_in * 1000)
        : undefined,
    extra: credentials.extra ?? {},
  }
}
