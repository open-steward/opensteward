/**
 * Authentication type constants — unified across all verticals.
 */

/** All supported authentication types */
export type AuthType = 'oauth2' | 'oauth2_cc' | 'api_key' | 'basic' | 'session' | 'local'

/** Human-readable labels for each auth type */
export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  oauth2: 'OAuth 2.0',
  oauth2_cc: 'OAuth 2.0 (Client Credentials)',
  api_key: 'API Key',
  basic: 'Basic Auth',
  session: 'Session',
  local: 'Local',
}

/** Returns true if the auth type uses an OAuth2 flow (authorization code or client credentials) */
export function isOAuth(authType: string): boolean {
  return authType === 'oauth2' || authType === 'oauth2_cc'
}

/** Returns true if the auth type requires client credentials (CLIENT_ID + CLIENT_SECRET) */
export function requiresClientCredentials(authType: string): boolean {
  return authType === 'oauth2' || authType === 'oauth2_cc'
}
