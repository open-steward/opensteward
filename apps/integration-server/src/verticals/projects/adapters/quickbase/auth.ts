/**
 * Quickbase auth — static user-token model (no OAuth).
 *
 * Quickbase REST calls authenticate with a personal user token sent as
 * `Authorization: QB-USER-TOKEN <token>`, scoped to a realm that
 * is supplied per request via the `QB-Realm-Hostname` header. Both values are
 * collected on the hosted Connect form: the token lands on
 * `credentials.accessToken`, the realm host on `credentials.extra.realmHostname`.
 *
 * Docs: https://developer.quickbase.com/auth
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export function getAuthUrlUnsupported(): never {
  throw new Error('quickbase uses static user-token auth; use credentialFields() instead')
}

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'realmHostname',
      label: 'Realm hostname',
      type: 'text',
      placeholder: 'acme.quickbase.com',
      helpText: 'Your Quickbase realm host — the domain you sign in at.',
      required: true,
    },
    {
      name: 'userToken',
      label: 'User token',
      type: 'password',
      helpText: 'Create one under My Preferences → Manage my user tokens.',
      required: true,
    },
  ]
}

function normalizeRealm(input: string): string {
  // Accept either a bare host or a full URL; strip scheme + path.
  let host = input.trim()
  host = host.replace(/^https?:\/\//i, '')
  host = host.replace(/\/.*$/, '')
  return host
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const realmHostname = normalizeRealm(fields['realmHostname'] ?? '')
  const userToken = (fields['userToken'] ?? '').trim()
  if (!realmHostname) throw new Error('quickbase credentialFields require realmHostname')
  if (!userToken) throw new Error('quickbase credentialFields require userToken')
  return { accessToken: userToken, extra: { realmHostname } }
}
