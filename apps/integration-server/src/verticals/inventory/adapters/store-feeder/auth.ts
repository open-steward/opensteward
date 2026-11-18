/**
 * StoreFeeder authentication.
 *
 * The API uses OAuth 2.0 Resource Owner Password Credentials Grant.
 *
 * Flow:
 *   1. User provides email, password, and API key.
 *   2. POST /Token (application/x-www-form-urlencoded):
 *        grant_type=password&username={email}&password={password}&client_id={apiKey}
 *   3. Response: { access_token, token_type, expires_in }
 *   4. All subsequent requests: Authorization: Bearer {access_token}
 *
 * The API key (client_id) is obtained from:
 *   StoreFeeder Settings > Company > Users > User Permissions > View / Edit Permissions.
 *
 * Note: token exchange is deferred to StoreFeederClient.fetchToken() so that the
 * integration server performs the actual HTTP call at runtime.  exchangeCredentials()
 * here only validates and stores the raw fields; the client calls /Token on first use.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('store-feeder uses OAuth password grant; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'StoreFeeder Email / Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
    { name: 'apiKey', label: 'API Key (client_id)', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  const apiKey = fields['apiKey']
  if (!username) throw new Error('store-feeder requires username')
  if (!password) throw new Error('store-feeder requires password')
  if (!apiKey) throw new Error('store-feeder requires apiKey')
  // Store raw fields; the client will call POST /Token to obtain the Bearer token.
  return { accessToken: '', extra: { username, password, apiKey } }
}
