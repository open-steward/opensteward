import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('listing-mirror uses API key; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'apiKey', label: 'API Token', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const apiKey = fields['apiKey']
  if (!username || !apiKey) throw new Error('listing-mirror credentialFields require username + apiKey')
  // Store as Basic auth token: base64(username:apiKey)
  const token = Buffer.from(`${username}:${apiKey}`).toString('base64')
  return { accessToken: token, extra: { username } }
}
