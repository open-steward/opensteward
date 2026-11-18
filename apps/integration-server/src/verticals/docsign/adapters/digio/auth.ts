/**
 * Digio auth helpers.
 *
 * Digio is an API-key platform with a two-token model: a `client_id` and
 * `client_secret` (rebranded "App ID / App Secret" in newer dashboards),
 * combined into an HTTP Basic credential. There is no OAuth flow.
 * `getAuthUrl` is unsupported.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  throw new Error(
    'Digio does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'Digio does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const clientId = fields['clientId'] ?? fields['client_id']
  const clientSecret = fields['clientSecret'] ?? fields['client_secret']
  if (!clientId) throw new Error('Digio exchangeCredentials requires field "clientId"')
  if (!clientSecret) throw new Error('Digio exchangeCredentials requires field "clientSecret"')
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return {
    accessToken: basic,
    extra: { clientId, clientSecret, authType: 'basic' },
  }
}
