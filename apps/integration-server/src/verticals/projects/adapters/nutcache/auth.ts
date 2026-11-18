/**
 * Nutcache authentication.
 *
 * Nutcache uses a custom HTTP Basic variant:
 *   Authorization: nut-basic <Base64(publicKey:username:password)>
 * plus api-version and OrganizationGuid request headers.
 *
 * Credentials are collected via credentialFields() and stored as:
 *   accessToken  — the pre-encoded Base64 token string
 *   extra.orgGuid — the OrganizationGuid header value
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('nutcache uses static API key auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'publicKey', label: 'API Public Key', type: 'password', required: true },
    { name: 'username', label: 'Account Username (email)', type: 'text', required: true },
    { name: 'password', label: 'Account Password', type: 'password', required: true },
    { name: 'orgGuid', label: 'Organization GUID', type: 'text', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const publicKey = fields['publicKey']
  const username = fields['username']
  const password = fields['password']
  const orgGuid = fields['orgGuid']
  if (!publicKey || !username || !password || !orgGuid) {
    throw new Error('nutcache requires publicKey, username, password, and orgGuid')
  }
  const encoded = Buffer.from(`${publicKey}:${username}:${password}`).toString('base64')
  return {
    accessToken: encoded,
    extra: { orgGuid },
  }
}
