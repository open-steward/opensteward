import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('billbee uses API key + Basic Auth credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'username', label: 'Billbee Username (email)', type: 'text', required: true },
    { name: 'apiPassword', label: 'API Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const username = fields['username']
  const apiPassword = fields['apiPassword']
  if (!apiKey || !username || !apiPassword) {
    throw new Error('billbee credentialFields require apiKey, username, and apiPassword')
  }
  return {
    accessToken: apiKey,
    extra: { username, apiPassword },
  }
}
