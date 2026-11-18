import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('korona-pos uses HTTP Basic auth (username + password); use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
    { name: 'accountId', label: 'KORONA Account ID (UUID)', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  const accountId = fields['accountId']
  if (!username || !password || !accountId) {
    throw new Error('korona-pos credentialFields require username, password, and accountId')
  }
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return { accessToken: token, extra: { accountId } }
}
