import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('mrpeasy uses API key + API secret (HTTP Basic); use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const apiSecret = fields['apiSecret']
  if (!apiKey || !apiSecret) throw new Error('mrpeasy credentialFields require apiKey + apiSecret')
  // accessToken stores the base64-encoded "apiKey:apiSecret" value
  const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return { accessToken: encoded, extra: {} }
}
