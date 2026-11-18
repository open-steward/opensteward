import type { Credentials, CredentialField } from '@opensteward/shared'

/**
 * Webgility Connect uses an appKey + appSecret pair to obtain a per-user
 * AccessToken via POST /v1/appusers. The token is then used as a Bearer
 * token in the Authorization header for all subsequent calls.
 *
 * Ref: https://github.com/webgility/connect-v1.0/wiki/AppUsers-API
 */

export function getAuthUrlUnsupported(): never {
  throw new Error('webgility uses appKey + appSecret; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'appKey', label: 'App Key', type: 'text', required: true },
    { name: 'appSecret', label: 'App Secret', type: 'password', required: true },
    { name: 'userEmail', label: 'User Email', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appKey = fields['appKey']
  const appSecret = fields['appSecret']
  const userEmail = fields['userEmail']
  if (!appKey || !appSecret || !userEmail) {
    throw new Error('webgility credentialFields require appKey, appSecret, and userEmail')
  }
  // The AccessToken is obtained at runtime by the client via POST /v1/appusers.
  // We store the raw credentials here; the client performs the token exchange.
  return { accessToken: '', extra: { appKey, appSecret, userEmail } }
}
