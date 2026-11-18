/**
 * Orderbot authentication.
 *
 * The API uses HTTP Basic credentials (email + password) to obtain a short-lived
 * Bearer token from GET /accesstoken.  All subsequent API calls use
 * Authorization: Bearer <token>.
 *
 * We store the raw credentials in `extra` so the client can re-authenticate
 * automatically when the token expires (TTL ~5 minutes).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('orderbot uses email + password credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'email', label: 'API Email Address', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const email = fields['email']
  const password = fields['password']
  if (!email || !password) throw new Error('orderbot requires email + password')
  // Store raw creds so the client can re-fetch the bearer token on expiry.
  // accessToken is left blank; the client fetches it on first use.
  return { accessToken: '', extra: { email, password } }
}
