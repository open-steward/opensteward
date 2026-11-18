import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('erpag uses API key + API secret; use credentialFields() instead')
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
  if (!apiKey || !apiSecret) throw new Error('erpag credentialFields require apiKey + apiSecret')
  // Store the pre-encoded Basic token in accessToken for convenience; keep
  // the raw pair in extra so callers can rebuild if needed.
  const token = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  return { accessToken: token, extra: { apiKey, apiSecret } }
}
