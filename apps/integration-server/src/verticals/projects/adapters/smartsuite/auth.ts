import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('smartsuite uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'accountId', label: 'Account (Workspace) ID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const accountId = fields['accountId']
  if (!apiKey) throw new Error('smartsuite credentialFields require apiKey')
  if (!accountId) throw new Error('smartsuite credentialFields require accountId')
  return { accessToken: apiKey, extra: { accountId } }
}
