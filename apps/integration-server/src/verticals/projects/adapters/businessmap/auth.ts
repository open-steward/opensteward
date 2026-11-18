import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('businessmap uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
    {
      name: 'subdomain',
      label: 'Account Subdomain',
      type: 'text',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  if (!apiKey) throw new Error('businessmap credentialFields require apiKey')
  const subdomain = fields['subdomain']
  if (!subdomain) throw new Error('businessmap credentialFields require subdomain')
  return { accessToken: apiKey, extra: { subdomain } }
}
