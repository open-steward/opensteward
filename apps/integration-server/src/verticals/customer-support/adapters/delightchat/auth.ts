/**
 * DelightChat auth — static API key.
 *
 * The API key is obtained from the DelightChat dashboard
 * (Settings > API) and sent as the `X-API-KEY` request header.
 * No OAuth flow is supported.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('DelightChat uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('DelightChat credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
