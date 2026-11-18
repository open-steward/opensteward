/**
 * Epicor Kinetic OAuth2 client_credentials auth.
 *
 * Auth flow:
 *   1. Tenant registers a ServerToServer client in the Epicor IdP admin UI.
 *   2. POST https://login.epicor.com/connect/token
 *        grant_type=client_credentials
 *        scope=epicor_erp idp_access
 *        client_id=<client_id>
 *        client_secret=<client_secret>
 *   3. Use returned access_token as Bearer on every ERP REST v2 request.
 *   4. Also pass the API key in the x-api-key header (required by default on
 *      REST v2 endpoints in addition to the bearer token).
 *
 * There is no browser redirect, so the Connect page collects these through
 * credentialFields() — which it renders for `oauth2_cc`, not `oauth2`.
 *
 * Stored in extra:
 *   host        — normalised ERP server host[:port], e.g. "acme.epicorsaas.com"
 *   instance    — ERP instance path, e.g. "EpicorERP"
 *   company     — Company code, e.g. "EPIC06"
 *   apiKey      — REST v2 API key (x-api-key header)
 *   clientId    — IdP client_id
 *   clientSecret — IdP client_secret
 *   expiresAt   — epoch ms of token expiry
 */
import axios from 'axios'
import { assertPublicHost } from '@opensteward/shared'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { EPICOR_TOKEN_URL, EPICOR_SCOPES } from './constants'

const HOST_LABEL = 'Epicor server host'
const PATH_SEGMENT = /^[A-Za-z0-9_.-]+$/

/**
 * Reduce the customer's Epicor server — `acme.epicorsaas.com`, a pasted
 * `https://acme.epicorsaas.com/EpicorERP/api/v2/` URL, or a self-hosted
 * `erp.example.com:8443` — to a lower-case `host[:port]`. The host is free-form
 * (SaaS or on-premises) and receives the bearer token and API key, so it must
 * be https; `assertPublicHost` vets where it resolves before any request.
 */
export function normaliseEpicorHost(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${HOST_LABEL} is required (e.g. acme.epicorsaas.com).`)
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${HOST_LABEL} is not a valid hostname.`)
  }
  if (url.protocol !== 'https:') throw new Error(`${HOST_LABEL} must use https.`)
  if (url.username || url.password) throw new Error(`${HOST_LABEL} must not contain credentials.`)
  if (!url.hostname.includes('.')) throw new Error(`${HOST_LABEL} is not a valid hostname.`)
  return url.host.toLowerCase()
}

/** Hostname (without port) of a normalised `host[:port]`, for `assertPublicHost`. */
export function epicorHostname(host: string): string {
  return new URL(`https://${host}`).hostname
}

/** Instance and company are URL path segments; refuse anything that could alter the path. */
export function epicorPathSegment(raw: unknown, label: string, example: string): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error(`${label} is required (e.g. ${example}).`)
  if (!PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${label} must be a single path segment (e.g. ${example}).`)
  }
  return value
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'host',
      label: 'ERP Host',
      type: 'text',
      placeholder: 'acme.epicorsaas.com',
      helpText: 'Your Epicor Kinetic server host (https). A pasted server URL is accepted; only the host is kept.',
      required: true,
    },
    { name: 'instance',     label: 'ERP Instance (e.g. EpicorERP)',         type: 'text',     required: true },
    { name: 'company',      label: 'Company Code (e.g. EPIC06)',            type: 'text',     required: true },
    { name: 'apiKey',       label: 'REST v2 API Key',                       type: 'password', required: true },
    { name: 'clientId',     label: 'IdP Client ID',                         type: 'text',     required: true },
    { name: 'clientSecret', label: 'IdP Client Secret',                     type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const host = normaliseEpicorHost(fields['host'])
  const instance = epicorPathSegment(fields['instance'], 'Epicor instance', 'EpicorERP')
  const company = epicorPathSegment(fields['company'], 'Epicor company code', 'EPIC06')
  const apiKey = (fields['apiKey'] ?? '').trim()
  const clientId = (fields['clientId'] ?? '').trim()
  const clientSecret = fields['clientSecret'] ?? ''
  if (!apiKey || !clientId || !clientSecret) {
    throw new Error('REST v2 API key, client ID and client secret are required.')
  }
  // The token comes from the fixed Epicor IdP, but it and the API key are then
  // sent to this host — refuse a private one before storing anything.
  await assertPublicHost(epicorHostname(host))
  return fetchToken(host, instance, company, apiKey, clientId, clientSecret)
}

export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const host         = String(extra['host']         ?? '')
  const instance     = String(extra['instance']     ?? '')
  const company      = String(extra['company']      ?? '')
  const apiKey       = String(extra['apiKey']       ?? '')
  const clientId     = String(extra['clientId']     ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')

  if (!host || !instance || !company || !apiKey || !clientId || !clientSecret) {
    // Cannot refresh without stored credentials — return as-is; caller handles 401.
    return credentials
  }
  return fetchToken(host, instance, company, apiKey, clientId, clientSecret)
}

async function fetchToken(
  host: string,
  instance: string,
  company: string,
  apiKey: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    scope:         EPICOR_SCOPES,
    client_id:     clientId,
    client_secret: clientSecret,
  })
  const { data } = await axios.post<{ access_token: string; expires_in?: number }>(
    EPICOR_TOKEN_URL,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    accessToken: data.access_token,
    extra: {
      host,
      instance,
      company,
      apiKey,
      clientId,
      clientSecret,
      expiresAt: String(Date.now() + expiresIn * 1000),
    },
  }
}
