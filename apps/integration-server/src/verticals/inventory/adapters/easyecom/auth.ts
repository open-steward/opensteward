import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('easyecom uses API key + JWT token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'X-API-Key', type: 'password', required: true },
    { name: 'jwtToken', label: 'JWT Token (90-day)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const jwtToken = fields['jwtToken']
  if (!apiKey || !jwtToken) throw new Error('easyecom credentialFields require apiKey + jwtToken')
  return { accessToken: jwtToken, extra: { apiKey } }
}
