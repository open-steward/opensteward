/**
 * FastSpring authenticates with an API credential pair — an API *username*
 * and *password* generated in the FastSpring app under Developer Tools >
 * APIs > API Credentials. Both are sent on every request as HTTP Basic auth
 * (`Authorization: Basic base64(username:password)`).
 *
 * There is no OAuth flow and no bearer token, so the adapter opts into the
 * Connect Link form via `customForm`: it collects both fields, stores the
 * password as `accessToken`, and carries the username on `credentials.extra`
 * so the client can reassemble the Basic header on every call.
 *
 * Docs: https://developer.fastspring.com/reference/getting-started-with-your-api
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'API username',
    type: 'text',
    required: true,
    helpText: 'Generated in FastSpring under Developer Tools > APIs > API Credentials.',
  },
  {
    name: 'password',
    label: 'API password',
    type: 'password',
    required: true,
    helpText: 'The password issued alongside the API username. Stored encrypted.',
  },
]

export const credentialForm = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const username = (fields.username ?? '').trim()
    const password = fields.password ?? ''
    if (!username) throw new Error('API username is required.')
    if (!password) throw new Error('API password is required.')
    return { accessToken: password, extra: { username } }
  },
})

/** Reads the API username back off stored credentials. */
export function usernameFromCredentials(credentials: Credentials): string {
  const u = (credentials.extra as { username?: unknown } | undefined)?.username
  return typeof u === 'string' ? u : ''
}
