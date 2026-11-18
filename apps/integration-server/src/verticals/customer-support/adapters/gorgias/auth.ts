import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('gorgias uses API key + subdomain; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'tenantSubdomain', label: 'Subdomain', type: 'text', required: true },
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const tenantSubdomain = fields['tenantSubdomain']
  if (!apiKey || !tenantSubdomain) throw new Error('gorgias credentialFields require apiKey + tenantSubdomain')
  return { accessToken: apiKey, extra: { tenantSubdomain } }
}
