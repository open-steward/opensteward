/**
 * Lealos auth helpers.
 *
 * Lealos is an API-key platform — there is no OAuth flow. The hosted
 * Connect form collects a single `apiKey` and persists it to
 * `credentials.accessToken`. `getAuthUrl` is unsupported.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  throw new Error(
    'Lealos does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Lealos does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey'] ?? fields['api_key']
  if (!apiKey) throw new Error('Lealos exchangeCredentials requires field "apiKey"')
  return {
    accessToken: apiKey,
    extra: {},
  }
}
