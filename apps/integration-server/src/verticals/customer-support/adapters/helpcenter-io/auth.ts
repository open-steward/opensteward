/**
 * HelpCenter.io auth — static API key.
 *
 * Credentials are passed via the `apikey` header (not Authorization: Bearer).
 * The key is stored as `accessToken` and injected by the client.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('helpcenter-io uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('helpcenter-io credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
