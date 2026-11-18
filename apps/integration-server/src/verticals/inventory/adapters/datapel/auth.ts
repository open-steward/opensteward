/**
 * Datapel WMS — Basic credential collection.
 *
 * Datapel Breeze DataServer uses HTTP Basic auth to obtain a short-lived
 * session token (24 h). Rather than expose a full OAuth flow the adapter
 * collects username, password, and the tenant server URL at credential
 * exchange time, then stores them so the client can refresh the token on
 * every cold start.
 *
 * Fields collected:
 *   username   — Breeze API username (configured in config.xml)
 *   password   — Breeze API password
 *   serverUrl  — base URL of the customer's Breeze server, e.g.
 *                https://<tenant>.datapelwms.net/json
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('datapel uses Basic credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'username', label: 'API Username', type: 'text', required: true },
    { name: 'password', label: 'API Password', type: 'password', required: true },
    {
      name: 'serverUrl',
      label: 'Server URL',
      type: 'text',
      required: false,
      // hint shown in UI
    },
  ]
}

/**
 * Stores the credentials for later use. No token exchange happens here because
 * the token requires a live HTTP call; the client fetches it lazily.
 */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  if (!username || !password) {
    throw new Error('datapel credentialFields require username + password')
  }
  const serverUrl = fields['serverUrl'] ?? ''
  // Store the base64-encoded Basic credential so the client can send it as the
  // Authorization header without re-encoding on every request.
  const authCode = Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
  return {
    accessToken: authCode,
    extra: { username, serverUrl },
  }
}
