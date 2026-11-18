/**
 * Infoplus auth helpers.
 *
 * Infoplus uses a static API key passed as the `API-Key` HTTP header on every
 * request. There is no OAuth2 flow, no token expiry, and no refresh step.
 *
 * Additionally, Infoplus is multi-tenant — each account has a unique domain
 * (e.g., "mycompany.infopluswms.com"). The domain is captured at connect time
 * and stored in credentials.extra.domain so the client can build the correct
 * base URL on every call.
 */

import type { Credentials } from '../../adapter/interface'
import { INFOPLUS_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  // Infoplus has no OAuth redirect flow — direct users to their portal.
  return INFOPLUS_DASHBOARD_URL
}

export async function exchangeApiKey(
  apiKey: string,
  domain: string,
): Promise<Credentials> {
  return {
    accessToken: apiKey,
    extra: { domain },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Infoplus API keys do not expire.
  return credentials
}

/**
 * The value used for the `API-Key` header on every request.
 */
export function apiKeyHeader(accessToken: string): string {
  return accessToken
}

/**
 * The tenant domain captured at connect time. Every Infoplus account lives on
 * its own host, so there is no default to fall back to: a connection without
 * one would send its API key to somebody else's tenant.
 */
export function domainFromCredentials(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const domain = typeof extra.domain === 'string' ? extra.domain.trim() : ''
  if (!domain) {
    throw new Error('Infoplus connection has no account domain; reconnect and enter it.')
  }
  return domain
}
