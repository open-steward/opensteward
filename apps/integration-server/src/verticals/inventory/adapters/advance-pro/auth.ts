/**
 * AdvancePro (APTX) auth helpers.
 *
 * Auth model: username + password submitted to POST /api/Authenticate/login,
 * which returns a JWT.  The token is stored as accessToken; the refresh token
 * is stored in extra.refreshToken.  Credentials are stored as supplied and
 * re-exchanged by the client when the token expires.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('advance-pro uses username + password; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
  ]
}

/**
 * Store the raw credentials so the client can POST /api/Authenticate/login on
 * first use.  We use accessToken = '__pending__' as a sentinel; the client
 * will exchange them for a real JWT before the first API call.
 */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  if (!username || !password) {
    throw new Error('advance-pro credentialFields require username + password')
  }
  return {
    accessToken: '__pending__',
    extra: { username, password },
  }
}
