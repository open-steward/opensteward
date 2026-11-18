import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('cin7-core uses API key + account ID; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Application Key', type: 'password', required: true },
    { name: 'accountId', label: 'Account ID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const accountId = fields['accountId']
  if (!apiKey || !accountId) throw new Error('cin7-core credentialFields require apiKey + accountId')
  return { accessToken: apiKey, extra: { accountId } }
}
