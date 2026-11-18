import type { Credentials } from '../../adapter/interface'

/**
 * Venipak uses username + password authentication — not OAuth2.
 *
 * Credentials are stored as:
 *   accessToken = username (used as the identifier)
 *   extra.password = password
 *
 * Both are sent as POST form fields on every API request.
 */

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const username = (fields['username'] ?? '').trim()
  const password = fields['password'] ?? ''
  if (!username) throw new Error('Venipak username is required.')
  if (!password) throw new Error('Venipak password is required.')
  return {
    accessToken: username,
    extra: { password },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Venipak credentials do not expire.
  return credentials
}

/**
 * Extract username and password from stored credentials.
 */
export function getAuthParams(credentials: Credentials): { user: string; pass: string } {
  const user = credentials.accessToken
  const pass = String((credentials.extra as Record<string, unknown> | undefined)?.['password'] ?? '')
  return { user, pass }
}
