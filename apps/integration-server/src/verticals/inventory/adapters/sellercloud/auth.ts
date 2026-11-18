/**
 * Descartes Sellercloud authentication.
 *
 * Sellercloud uses JWT Bearer token authentication.  Callers supply their
 * Sellercloud username, password, and team subdomain.  The client POSTs to
 * `{baseUrl}/api/token` to obtain a short-lived access_token which is then
 * sent as `Authorization: Bearer <token>` on every API call.
 *
 * We store the raw credentials (username + password + baseUrl) in
 * `Credentials.extra` so the client can re-authenticate when the token expires.
 * The live bearer token is cached in `accessToken`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('sellercloud uses username + password credentials; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'username',
      label: 'Sellercloud Username',
      type: 'text',
      required: true,
    },
    {
      name: 'password',
      label: 'Sellercloud Password',
      type: 'password',
      required: true,
    },
    {
      name: 'teamSubdomain',
      label: 'Team Subdomain (e.g. "mycompany" for mycompany.api.sellercloud.com)',
      type: 'text',
      required: true,
    },
  ]
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = fields['username']
  const password = fields['password']
  const teamSubdomain = fields['teamSubdomain']
  if (!username || !password || !teamSubdomain) {
    throw new Error('sellercloud requires username, password, and teamSubdomain')
  }
  // Store raw credentials so the client can re-authenticate on token expiry.
  // accessToken will be populated by the client on first use.
  return {
    accessToken: '',
    extra: { username, password, teamSubdomain },
  }
}
