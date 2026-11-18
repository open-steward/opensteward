/**
 * SAP EWM — OAuth 2.0 client-credentials auth.
 *
 * SAP S/4HANA and SAP EWM use an on-premise OAuth 2.0 server located at
 *   POST https://<host>:<port>/sap/bc/sec/oauth2/token[?sap-client=NNN]
 *
 * Grant type: client_credentials
 * Credentials are sent as HTTP Basic (clientId:clientSecret) per RFC 6749.
 *
 * There is no browser redirect, so the platform's correct auth_type is
 * `oauth2_cc` — the Connect page renders `credentialFields()` only for
 * non-oauth2 auth types.
 *
 * The base URL is the customer's own S/4HANA host and receives the client
 * secret and every bearer token, so it is normalised (https only, no userinfo,
 * trimmed back to the part in front of `/sap/`), stored normalised in
 * `credentials.extra.baseUrl`, and checked to resolve to a public address
 * before any request.
 */
import axios from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_TOKEN_PATH } from './constants'

/**
 * Reduce a pasted S/4HANA URL to scheme + host + port (+ any reverse-proxy path
 * prefix in front of `/sap/`). `https://s4.acme.example:44300/sap/opu/odata/sap/X/`
 * becomes `https://s4.acme.example:44300`.
 */
export function normaliseSapBaseUrl(raw: unknown): string {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (!s) {
    throw new Error('SAP S/4HANA base URL is required (e.g. https://my-s4.example.com:44300).')
  }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error('SAP S/4HANA base URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') {
    throw new Error('SAP S/4HANA base URL must use https://.')
  }
  if (url.username || url.password) {
    throw new Error('SAP S/4HANA base URL must not contain a username or password.')
  }
  const sapAt = url.pathname.search(/\/sap(?:\/|$)/i)
  const prefix = (sapAt >= 0 ? url.pathname.slice(0, sapAt) : url.pathname).replace(/\/+$/, '')
  return `${url.origin}${prefix}`
}

/** Optional three-digit SAP logon client (`sap-client`). Blank → undefined. */
export function normaliseSapClient(raw: unknown): string | undefined {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (!s) return undefined
  if (!/^\d{3}$/.test(s)) throw new Error('SAP client must be a three-digit number (e.g. 100).')
  return s
}

/** Hostname of a normalised base URL, without IPv6 brackets, for assertPublicHost. */
export function sapHostOf(baseUrl: string): string {
  return new URL(baseUrl).hostname.replace(/^\[|\]$/g, '')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'baseUrl',
      label: 'SAP S/4HANA base URL',
      type: 'url',
      required: true,
      placeholder: 'https://my-s4.example.com:44300',
      helpText: 'The https address of your S/4HANA system (the part in front of /sap/).',
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
    {
      name: 'sapClient',
      label: 'SAP client (optional)',
      type: 'text',
      required: false,
      placeholder: '100',
      helpText: 'Three-digit logon client, sent as sap-client. Leave blank to use the system default.',
    },
    {
      name: 'scope',
      label: 'OAuth2 Scope (optional)',
      type: 'text',
      required: false,
    },
  ]
}

export interface SapTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  scope?: string
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const baseUrl = normaliseSapBaseUrl(fields['baseUrl'])
  const clientId = (fields['clientId'] ?? '').trim()
  const clientSecret = fields['clientSecret'] ?? ''
  if (!clientId) throw new Error('SAP OAuth2 client ID is required.')
  if (!clientSecret) throw new Error('SAP OAuth2 client secret is required.')
  const sapClient = normaliseSapClient(fields['sapClient'])
  const scope = (fields['scope'] ?? '').trim()

  // The client secret is about to be sent to this host.
  await assertPublicHost(sapHostOf(baseUrl))

  const query = sapClient ? `?${new URLSearchParams({ 'sap-client': sapClient }).toString()}` : ''
  const tokenUrl = `${baseUrl}${OAUTH_TOKEN_PATH}${query}`

  const params = new URLSearchParams({ grant_type: 'client_credentials' })
  if (scope) params.set('scope', scope)

  const { data } = await axios.post<SapTokenResponse>(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    auth: { username: clientId, password: clientSecret },
    timeout: 15_000,
  })

  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1_000)
      : undefined,
    extra: {
      baseUrl,
      clientId,
      clientSecret,
      scope: scope || data.scope || '',
      ...(sapClient ? { sapClient } : {}),
    },
  }
}

/**
 * Re-issue a token using the stored client credentials.
 * SAP tokens typically expire after 3 600 s (1 h).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, string | undefined>
  return exchangeCredentials({
    baseUrl: extra['baseUrl'] ?? '',
    clientId: extra['clientId'] ?? '',
    clientSecret: extra['clientSecret'] ?? '',
    sapClient: extra['sapClient'] ?? '',
    scope: extra['scope'] ?? '',
  })
}

/**
 * SAP EWM uses client-credentials flow — there is no interactive auth URL.
 */
export function getAuthUrl(_state: string, _scopes?: string[]): never {
  throw new Error('sap-ewm uses OAuth2 client-credentials; call exchangeCredentials() instead')
}
