import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('agiliron uses API key + company subdomain; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'company', label: 'Company Subdomain (e.g. mycompany)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const company = fields['company']
  if (!apiKey) throw new Error('agiliron credentialFields require apiKey')
  if (!company) throw new Error('agiliron credentialFields require company subdomain')
  return { accessToken: apiKey, extra: { company } }
}
