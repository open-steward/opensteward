/**
 * D4Sign auth helpers.
 *
 * D4Sign is an API-key platform — there is no OAuth flow. The hosted
 * Connect form collects `tokenAPI` + `cryptKey`; both are persisted to
 * `credentials.extra` (the access token mirrors `tokenAPI` for parity
 * with the BaseAdapter contract). `getAuthUrl` is unsupported.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  throw new Error(
    'D4Sign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
  throw new Error(
    'D4Sign does not support OAuth. Use credentialFields() + exchangeCredentials() instead.',
  )
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export async function exchangeApiKey(fields: Record<string, string>): Promise<Credentials> {
  const tokenAPI = fields['tokenAPI'] ?? fields['tokenApi'] ?? fields['token_api']
  const cryptKey = fields['cryptKey'] ?? fields['crypt_key']
  if (!tokenAPI) throw new Error('D4Sign exchangeCredentials requires field "tokenAPI"')
  if (!cryptKey) throw new Error('D4Sign exchangeCredentials requires field "cryptKey"')
  return {
    accessToken: tokenAPI,
    extra: { tokenAPI, cryptKey },
  }
}
