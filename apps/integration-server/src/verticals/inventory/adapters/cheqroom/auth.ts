/**
 * Cheqroom API key authentication.
 *
 * Users generate an API key via Settings → Integrations → API in the
 * Cheqroom UI. The key is passed as a Bearer token on every request.
 * Keys do not expire but can be regenerated or revoked at any time.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('cheqroom uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('cheqroom credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
