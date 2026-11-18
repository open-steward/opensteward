import type { Credentials, CredentialField } from '@opensteward/shared'

/**
 * Orderful uses a single API key passed as the `orderful-api-key` header.
 * Keys are generated in the Orderful UI under Organization Settings > API Credentials.
 *
 * Docs: https://docs.orderful.com/reference/authentication
 */
export function getAuthUrlUnsupported(): never {
  throw new Error('orderful uses a static API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'Orderful API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('orderful credentialFields require apiKey')
  return { accessToken: apiKey }
}
