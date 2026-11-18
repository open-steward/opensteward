import type { Credentials } from '../../adapter/interface'
import { GOFREIGHT_DASHBOARD_URL } from './constants'

export interface GoFreightAuthConfig {
  /**
   * The API key obtained from GoFreight staff.
   * Sent as `X-GATEWAY-TOKEN` on every request.
   */
  apiKey: string
}

/**
 * Returns the GoFreight dashboard URL as the "auth URL".
 * GoFreight uses API-key auth rather than a browser-based OAuth2 flow, so
 * we direct users to the dashboard where they can retrieve their key.
 */
export function buildAuthUrl(_state: string): string {
  return GOFREIGHT_DASHBOARD_URL
}

/**
 * Exchanges an API key for a Credentials object.
 * GoFreight API keys do not expire, so expiresAt is left undefined.
 */
export function exchangeApiKey(config: GoFreightAuthConfig): Credentials {
  return {
    accessToken: config.apiKey,
    expiresAt: undefined,
    extra: { apiKey: config.apiKey },
  }
}

/**
 * GoFreight API keys do not expire or rotate automatically.
 * Re-wraps the stored key so the interface contract is satisfied.
 */
export function refreshCredentials(credentials: Credentials): Credentials {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const apiKey = (extra.apiKey as string | undefined) ?? credentials.accessToken
  return { accessToken: apiKey, expiresAt: undefined, extra: { apiKey } }
}

/**
 * GoFreight keys do not expire, so this always returns false.
 */
export function isTokenExpired(_credentials: Credentials): boolean {
  return false
}
