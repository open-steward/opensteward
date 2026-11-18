/**
 * Southeastern Freight Lines – authentication helpers.
 *
 * SEFL uses HTTP Basic Auth (MySEFL username:password).
 * Credentials are stateless: no token exchange, no expiry.
 * The `shipper_account` header is a separate account-number identifier
 * carried in `credentials.extra.shipperAccount`.
 */

import type { Credentials } from '../../adapter/interface'
import { SEFL_DASHBOARD_URL } from './constants'

export interface SeflAuthConfig {
  username: string
  password: string
  shipperAccount?: string
}

/**
 * Returns the MySEFL portal URL for the user to retrieve credentials.
 * SEFL uses Basic Auth so there is no OAuth redirect flow.
 */
export function buildAuthUrl(_state: string): string {
  return SEFL_DASHBOARD_URL
}

/**
 * Builds a Credentials object from plain MySEFL username / password.
 * Basic auth tokens never expire, so expiresAt is omitted.
 */
export function buildCredentials(config: SeflAuthConfig): Credentials {
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64')
  return {
    accessToken: encoded,
    extra: {
      username: config.username,
      password: config.password,
      shipperAccount: config.shipperAccount ?? '',
    },
  }
}

/**
 * No-op: Basic-auth credentials do not expire or require refresh.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Returns the `Authorization: Basic …` header value.
 */
export function basicAuthHeader(accessToken: string): string {
  return `Basic ${accessToken}`
}

/**
 * Returns the shipper_account header value from stored extras.
 */
export function shipperAccountHeader(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return (extra.shipperAccount as string | undefined) ?? ''
}
