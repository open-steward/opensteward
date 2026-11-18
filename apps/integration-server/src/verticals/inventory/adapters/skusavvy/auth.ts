import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('skusavvy uses a static API token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiToken', label: 'API Token', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiToken = fields['apiToken']
  if (!apiToken) throw new Error('skusavvy credentialFields require apiToken')
  return { accessToken: apiToken, extra: {} }
}
