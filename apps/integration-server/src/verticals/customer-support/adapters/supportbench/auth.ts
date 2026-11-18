/**
 * Supportbench authentication — API key via `username` + `password` headers.
 *
 * Supportbench authenticates every request with two headers:
 *   username: <api-key>
 *   password: <api-key>
 *
 * Both headers carry the same API key value.
 * The key is stored in `accessToken` for consistency with the shared credential model.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('Supportbench uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('Supportbench credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
