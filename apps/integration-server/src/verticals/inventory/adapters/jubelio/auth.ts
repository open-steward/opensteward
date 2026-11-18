/**
 * Jubelio auth — email + password → POST /login → token.
 *
 * The caller stores the returned token in credentials.accessToken. The
 * JubelioClient then sends it verbatim in the Authorization header (no
 * "Bearer" prefix — this matches the PHP reference client behaviour).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('jubelio uses email + password credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'email', label: 'Jubelio Account Email', type: 'text', required: true },
    { name: 'password', label: 'Jubelio Account Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const email = fields['email']
  const password = fields['password']
  if (!email || !password) throw new Error('jubelio credentialFields require email + password')
  // Callers must POST to /login themselves using JubelioClient.login(); the
  // raw fields are stored here so refreshCredentials can re-login when needed.
  return { accessToken: '', extra: { email, password } }
}
