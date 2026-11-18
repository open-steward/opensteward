/**
 * Paysafe authentication — HTTP Basic.
 *
 * Paysafe issues an API key as a `Key ID` (username) + `Key Password` pair.
 * Every request carries `Authorization: Basic base64("<keyId>:<keyPassword>")`.
 * There is no OAuth handshake and no refresh token — the key is long-lived.
 *
 * The key is environment-bound: a Test key only works against the test host,
 * a Production key only against the production host. The customer selects the
 * environment on the Connect Link form; we resolve the host once here and
 * stash it on `credentials.extra.baseUrl` so the client doesn't re-derive it.
 *
 * The shape is bespoke (a key *pair* + an environment selector, not a single
 * API key), so we build it from the shared `customForm` template rather than
 * `simpleApiKey`.
 *
 * Docs: https://developer.paysafe.com/en/support/reference-information/authentication/
 */
import { customForm } from '@opensteward/shared'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, PRODUCTION_BASE_URL, TEST_BASE_URL } from './constants'

const FIELDS: CredentialField[] = [
  {
    name: 'keyId',
    label: 'Key ID (username)',
    type: 'text',
    required: true,
    helpText: 'The API key username from the Paysafe merchant portal (Settings → API Keys).',
  },
  {
    name: 'keyPassword',
    label: 'Key password',
    type: 'password',
    required: true,
    helpText: 'The API key password paired with the Key ID. Case-sensitive.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    helpText: 'Keys are environment-bound — a Test key only works against the Test host.',
    options: [
      { value: 'test', label: 'Test' },
      { value: 'production', label: 'Production' },
    ],
  },
]

/** Resolve the Paysafe host for the selected environment. */
export function resolveBaseUrl(environment: string | undefined): string {
  switch ((environment ?? '').trim().toLowerCase()) {
    case 'production':
    case 'prod':
    case 'live':
      return PRODUCTION_BASE_URL
    case 'test':
    case 'sandbox':
      return TEST_BASE_URL
    default:
      return DEFAULT_BASE_URL
  }
}

/** Build the `Basic …` token from the Key ID + Key password pair. */
export function buildBasicToken(keyId: string, keyPassword: string): string {
  return Buffer.from(`${keyId}:${keyPassword}`).toString('base64')
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const keyId = (fields.keyId ?? '').trim()
  const keyPassword = fields.keyPassword ?? ''
  if (!keyId || !keyPassword) {
    throw new Error('Paysafe requires both a Key ID and a Key password.')
  }
  const baseUrl = resolveBaseUrl(fields.environment)
  return {
    // Pre-encoded Basic token; the client sends `Authorization: Basic <accessToken>`.
    accessToken: buildBasicToken(keyId, keyPassword),
    extra: { baseUrl, environment: fields.environment ?? 'test' },
  }
}

/** Connect Link form descriptor + exchange, built from the shared template. */
export const PAYSAFE_CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  exchange: async (fields) => buildCredentials(fields),
})

export const CREDENTIAL_FIELDS = PAYSAFE_CREDENTIAL_FORM.credentialFields()
