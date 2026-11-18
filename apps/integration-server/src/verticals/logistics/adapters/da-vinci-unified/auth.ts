import type { Credentials } from '../../adapter/interface'
import { DA_VINCI_DASHBOARD_URL } from './constants'

export interface DaVinciUnifiedAuthConfig {
  /** Customer login e-mail address. */
  email: string
  /** Customer login password. */
  password: string
  /** License ID assigned to the customer account. */
  licenseId: string
  /** Database / warehouse-group name. */
  dbName: string
  /**
   * Optional customer-specific server root URL (e.g. https://dv1.wdgcorp.com:8443/v1/).
   * Defaults to the public API host when omitted.
   */
  serverUrl?: string
  sandbox?: boolean
}

/**
 * Returns the Da Vinci Unified dashboard URL.
 * Da Vinci uses Basic-auth — there is no OAuth redirect flow.
 */
export function buildAuthUrl(_state: string): string {
  return DA_VINCI_DASHBOARD_URL
}

/**
 * Constructs credentials from email + password + instance details.
 *
 * Da Vinci uses HTTP Basic authentication: Authorization: Basic <base64(email:password)>.
 * The base64 token is stored as accessToken so it can be forwarded directly in
 * the Authorization header.  Instance metadata (licenseId, dbName, serverUrl)
 * is stored in extra for URL construction at request time.
 */
export function buildCredentials(config: DaVinciUnifiedAuthConfig): Credentials {
  const basicToken = Buffer.from(`${config.email}:${config.password}`).toString('base64')
  return {
    accessToken: basicToken,
    extra: {
      email: config.email,
      licenseId: config.licenseId,
      dbName: config.dbName,
      serverUrl: config.serverUrl ?? null,
      sandbox: config.sandbox ?? false,
    },
  }
}

/**
 * Basic-auth credentials do not expire — return them unchanged.
 */
export function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return Promise.resolve(credentials)
}

/**
 * Basic-auth credentials never expire.
 */
export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}

/**
 * Returns the Authorization header value for a given Basic-auth token.
 * The token must already be base64-encoded (email:password).
 */
export function authHeader(basicToken: string): string {
  return `Basic ${basicToken}`
}
