/**
 * Finix authenticates requests with HTTP Basic Authentication (RFC 7617).
 * The username is a User resource ID (the API key username, e.g. `USsRhs…`)
 * and the password is the matching secret key (a UUID).
 *
 * There is no token exchange or refresh — the key pair is long-lived and
 * submitted directly via the Connect Link form. We store the Base64-encoded
 * `username:password` pair as the access token and a `live` flag (so the
 * client can pick the live vs. sandbox host) on `credentials.extra`.
 *
 * Docs: https://docs.finix.com/api/section/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'

export const FINIX_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'username',
    label: 'API key username',
    type: 'text',
    required: true,
    placeholder: 'USsRhsHYZGBPnQw8CByJyEQW',
    helpText: 'The User resource ID from Dashboard → Developer → API Keys.',
  },
  {
    name: 'password',
    label: 'API key secret',
    type: 'password',
    required: true,
    helpText: 'The secret key (a UUID) paired with the username above.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'sandbox', label: 'Sandbox' },
      { value: 'live', label: 'Live' },
    ],
    helpText: 'Which Finix host the API keys belong to.',
  },
]

export function buildCredentials(fields: Record<string, string>): Credentials {
  const username = (fields.username ?? '').trim()
  const password = fields.password ?? ''
  if (!username || !password) {
    throw new Error('Finix requires both an API key username and secret.')
  }
  const basic = Buffer.from(`${username}:${password}`).toString('base64')
  const live = (fields.environment ?? 'sandbox').toLowerCase() === 'live'
  return {
    accessToken: basic,
    extra: { live, username },
  }
}
