import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('spherewms uses API key + environment name; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'environment', label: 'Environment Name', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const environment = fields['environment']
  if (!apiKey || !environment) throw new Error('spherewms credentialFields require apiKey + environment')
  return { accessToken: apiKey, extra: { environment } }
}
