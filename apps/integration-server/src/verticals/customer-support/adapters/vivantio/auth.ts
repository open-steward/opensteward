/**
 * Vivantio authentication — HTTP Basic Auth (username + password).
 *
 * The credential surface exposed to users is a username + password pair.
 * We store the base64-encoded "username:password" string as accessToken so
 * the client can inject it verbatim into the Authorization header.
 *
 * Optionally the user can supply an alternate API base URL (for non-NA01
 * regional tenants, e.g. https://webservices-eu01.vivantio.com).
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { API_BASE_URL_DEFAULT } from './constants'

export function getAuthUrlUnsupported(): never {
  throw new Error('vivantio uses HTTP Basic Auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
    {
      name: 'apiBaseUrl',
      label: 'API Base URL (optional — defaults to NA01)',
      type: 'text',
      required: false,
    },
  ]
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const username = fields['username']?.trim()
  const password = fields['password'] ?? ''
  if (!username) throw new Error('vivantio: username is required')

  // base64-encode "username:password" for Basic auth
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  const apiBaseUrl = fields['apiBaseUrl']?.trim() || API_BASE_URL_DEFAULT

  return {
    accessToken: encoded,
    extra: { apiBaseUrl },
  }
}
