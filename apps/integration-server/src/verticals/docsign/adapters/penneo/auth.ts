import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('penneo uses HTTP Basic with apiKey + apiSecret; use credentialFields() instead')
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
  if (!apiKey || !apiSecret) throw new Error('penneo requires apiKey + apiSecret')
  const basic = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return { accessToken: basic, extra: { apiKey } }
}
