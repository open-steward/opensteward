import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('picqer uses API key + subdomain; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'subdomain', label: 'Picqer subdomain (e.g. mycompany)', type: 'text', required: true },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']
  const apiKey = fields['apiKey']
  if (!subdomain) throw new Error('picqer credentialFields require subdomain')
  if (!apiKey) throw new Error('picqer credentialFields require apiKey')
  return { accessToken: apiKey, extra: { subdomain } }
}
