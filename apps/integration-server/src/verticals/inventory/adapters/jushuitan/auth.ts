import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('jushuitan uses app_key + app_secret + access_token; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'appKey', label: 'App Key', type: 'text', required: true },
    { name: 'appSecret', label: 'App Secret', type: 'password', required: true },
    { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appKey = fields['appKey']
  const appSecret = fields['appSecret']
  const accessToken = fields['accessToken']
  if (!appKey || !appSecret || !accessToken) {
    throw new Error('jushuitan credentialFields require appKey, appSecret, and accessToken')
  }
  return { accessToken, extra: { appKey, appSecret } }
}
