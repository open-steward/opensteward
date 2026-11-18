import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('itemit uses API key + user credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'userId', label: 'User ID', type: 'text', required: true },
    { name: 'userToken', label: 'User Token', type: 'password', required: true },
    { name: 'workspaceId', label: 'Workspace ID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const apiKey = fields['apiKey']
  const userId = fields['userId']
  const userToken = fields['userToken']
  const workspaceId = fields['workspaceId']
  if (!apiKey || !userId || !userToken || !workspaceId) {
    throw new Error('itemit credentialFields require apiKey, userId, userToken, and workspaceId')
  }
  return { accessToken: apiKey, extra: { userId, userToken, workspaceId } }
}
