/**
 * Clicksign auth helpers.
 *
 * Clicksign is an API-key platform — there is no OAuth flow. The hosted
 * Connect form collects a single `apiKey` and `exchangeCredentials`
 * persists it to `credentials.accessToken`. `getAuthUrl` is unsupported.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  throw new Error(
    'Clicksign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Clicksign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys never expire; return the same credentials unchanged.
  return credentials
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey'] ?? fields['access_token']
  if (!apiKey) throw new Error('Clicksign exchangeCredentials requires field "apiKey"')
  return {
    accessToken: apiKey,
    extra: {},
  }
}
