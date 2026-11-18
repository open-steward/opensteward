import type { Credentials } from '../../adapter/interface'
import { KARRIO_API_PATH, KARRIO_DASHBOARD_URL } from './constants'

/**
 * Karrio uses API key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the Karrio API settings page (no redirect flow).
 * exchangeApiKey:      Treats the supplied key as the access token directly.
 * refreshCredentials:  API keys never expire; returns existing credentials unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // Karrio has no OAuth2 flow — direct users to their API keys page.
  return KARRIO_DASHBOARD_URL
}

/**
 * The API key IS the credential. `baseUrl`, when given, is the customer's own
 * Karrio instance and is kept on `credentials.extra.baseUrl`.
 */
export async function exchangeApiKey(apiKey: string, baseUrl?: string): Promise<Credentials> {
  return baseUrl === undefined
    ? { accessToken: apiKey }
    : { accessToken: apiKey, extra: { baseUrl: normaliseKarrioHost(baseUrl) } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Karrio API keys do not expire.
  return credentials
}

/**
 * Build the Authorization header value for Karrio requests.
 * https://docs.karrio.io/reference/openapi, security scheme `Token`:
 *   "Authorization: Token key_xxxxxxxx"
 */
export function authHeader(apiKey: string): string {
  return `Token ${apiKey}`
}

/**
 * The customer's Karrio instance, as `https://host[/prefix]` without a trailing
 * slash. "All API requests must be made over HTTPS" (API reference), and the
 * API key is sent to this host, so it must be https and carry no userinfo.
 * A trailing `/v1` is dropped: the client adds the version path itself.
 */
export function normaliseKarrioHost(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new Error('Karrio API URL is required.')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error('Karrio API URL is not a valid URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Karrio API URL must use https.')
  if (url.username || url.password) throw new Error('Karrio API URL must not contain credentials.')
  if (!url.hostname.includes('.')) throw new Error('Karrio API URL is not a valid URL.')
  const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '')
  return `${url.origin}${path}`
}

/** `<host>/v1/`: the base every relative API path resolves against. */
export function karrioApiBase(host: string): string {
  return `${host}${KARRIO_API_PATH}`
}
