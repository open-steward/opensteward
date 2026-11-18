import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('fulfil-io uses API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'subdomain', label: 'Subdomain (e.g. acme for acme.fulfil.io)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const subdomain = fields['subdomain']
  if (!apiKey) throw new Error('fulfil-io credentialFields require apiKey')
  if (!subdomain) throw new Error('fulfil-io credentialFields require subdomain')
  return { accessToken: apiKey, extra: { subdomain } }
}
