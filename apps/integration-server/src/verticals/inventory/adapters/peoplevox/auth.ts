/**
 * Peoplevox WMS auth helpers.
 *
 * Peoplevox uses a SOAP session-based auth flow:
 *   1. POST Authenticate SOAP envelope with clientId + username + base64(password).
 *   2. Response Detail contains "clientId,sessionUuid".
 *   3. All subsequent SOAP calls carry UserSessionCredentials (UserId=0, ClientId, SessionId).
 *
 * We treat clientId + username + password as the "api_key" credential set
 * and acquire a fresh session token inside the client on first use.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('peoplevox uses SOAP session auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    { name: 'clientId', label: 'Client ID', type: 'text', required: true },
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const clientId = fields['clientId']
  const username = fields['username']
  const password = fields['password']
  if (!clientId || !username || !password) {
    throw new Error('peoplevox requires clientId, username, and password')
  }
  // accessToken is a composite marker; the real session is obtained at request time.
  return {
    accessToken: `${clientId}:${username}`,
    extra: { clientId, username, password },
  }
}
