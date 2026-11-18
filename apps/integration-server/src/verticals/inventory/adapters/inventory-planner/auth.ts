import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('inventory-planner uses API key + Account ID headers; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'accountId', label: 'Account ID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const accountId = fields['accountId']
  if (!apiKey || !accountId) throw new Error('inventory-planner credentialFields require apiKey + accountId')
  return { accessToken: apiKey, extra: { accountId } }
}
