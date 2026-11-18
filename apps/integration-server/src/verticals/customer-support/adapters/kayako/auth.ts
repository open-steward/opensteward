/**
 * Kayako auth — Basic HTTP auth using email:password encoded as Base64.
 * The api_key model stores email in `accessToken` and password in
 * `extra.password`; the subdomain is stored in `extra.subdomain`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('kayako uses Basic HTTP auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'subdomain', label: 'Subdomain (e.g. acme for acme.kayako.com)', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const subdomain = fields['subdomain']
  const email = fields['email']
  const password = fields['password']
  if (!subdomain) throw new Error('kayako credentialFields require subdomain')
  if (!email) throw new Error('kayako credentialFields require email')
  if (!password) throw new Error('kayako credentialFields require password')
  return {
    accessToken: email,
    extra: { subdomain, password },
  }
}
