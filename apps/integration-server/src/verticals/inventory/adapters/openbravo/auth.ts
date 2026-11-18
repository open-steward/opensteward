/**
 * Openbravo basic-auth credential handling.
 *
 * Openbravo uses standard HTTP Basic Authentication (RFC 7617).
 * Credentials are a username + password pair together with the
 * customer-specific host URL (on-premise or Openbravo Cloud hostname).
 *
 * The password is stored as `accessToken` and the username + host are
 * stored in `extra` so they can be re-used on every request.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('openbravo uses HTTP Basic Auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'host',
      label: 'Openbravo Host URL',
      type: 'text',
      required: true,
      placeholder: 'https://your-instance.openbravo.com',
    },
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const host = (fields['host'] ?? '').replace(/\/$/, '')
  const username = fields['username']
  const password = fields['password']
  if (!host || !username || !password) {
    throw new Error('openbravo requires host, username, and password')
  }
  // Store password as accessToken; username + host go in extra.
  return { accessToken: password, extra: { host, username } }
}
