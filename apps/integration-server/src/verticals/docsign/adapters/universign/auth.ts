/**
 * Universign auth helpers.
 *
 * "To authenticate your request, you must include your API key in the request
 * header as the value of the username followed by a colon: -u your_API_key:
 * (the password field can be left empty)."
 * (https://apps.universign.com/docs/api/#authentication)
 *
 * An API key is the only credential. There is no interactive OAuth flow; the
 * key is collected via the Connect Link form and stored as `accessToken`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const UNIVERSIGN_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText:
      'Created in your Universign workspace by a member with admin or developer access. Sent as the HTTP Basic username with an empty password.',
    required: true,
  },
]

export async function exchangeUniversignCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('Universign API key is required.')
  return { accessToken: apiKey }
}

export async function refreshUniversignCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API key — no refresh.
  return credentials
}

/** `-u your_API_key:` — the key as the Basic username, an empty password. */
export function basicAuthHeader(credentials: Credentials): string {
  const apiKey = credentials.accessToken ?? ''
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`
}
