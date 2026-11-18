/**
 * ClearFeed auth — static API key (Bearer token).
 *
 * Users generate a token from Settings → Developer Settings → Generate Token.
 * The token is used as a Bearer token in the Authorization header.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('clearfeed uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('clearfeed credentialFields require apiKey')
  return { accessToken: apiKey, extra: {} }
}
