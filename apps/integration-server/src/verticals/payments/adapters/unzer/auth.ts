/**
 * Unzer authentication — HTTP Basic with a private API key.
 *
 * Unzer issues a single private key (`s-priv-…` for sandbox, `p-priv-…` for
 * production). Every server-side request authenticates with HTTP Basic where
 * the private key is the username and the password is empty:
 *
 *   Authorization: Basic base64("<privateKey>:")
 *
 * (The trailing colon supplies the empty password.) There is no OAuth
 * handshake and no refresh token in this flow — the key is long-lived.
 *
 * The key is environment-bound by its prefix: a sandbox key only works against
 * the sandbox host, a production key only against production. We resolve the
 * host from the prefix here and stash it on `credentials.extra.baseUrl` so the
 * client doesn't re-derive it.
 *
 * Docs: https://docs.unzer.com/server-side-integration/api-basics/authentication/
 */
import { customForm } from '@opensteward/shared'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

const FIELDS: CredentialField[] = [
  {
    name: 'privateKey',
    label: 'Private key',
    type: 'password',
    required: true,
    helpText:
      'Your Unzer private key from the Insights portal. Sandbox keys start s-priv-…; production keys start p-priv-…',
  },
]

/** Resolve the Unzer host from the private-key prefix. */
export function resolveBaseUrl(privateKey: string | undefined): string {
  const key = (privateKey ?? '').trim().toLowerCase()
  if (key.startsWith('p-priv-')) return PRODUCTION_BASE_URL
  if (key.startsWith('s-priv-')) return SANDBOX_BASE_URL
  return DEFAULT_BASE_URL
}

/** Build the `Basic …` token from the private key (username) + empty password. */
export function buildBasicToken(privateKey: string): string {
  return Buffer.from(`${privateKey}:`).toString('base64')
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const privateKey = (fields.privateKey ?? '').trim()
  if (!privateKey) {
    throw new Error('Unzer requires a private key.')
  }
  return {
    // Pre-encoded Basic token; the client sends `Authorization: Basic <accessToken>`.
    accessToken: buildBasicToken(privateKey),
    extra: { baseUrl: resolveBaseUrl(privateKey) },
  }
}

/** Connect Link form descriptor + exchange, built from the shared template. */
export const UNZER_CREDENTIAL_FORM = customForm({
  fields: FIELDS,
  exchange: async (fields) => buildCredentials(fields),
})

export const CREDENTIAL_FIELDS = UNZER_CREDENTIAL_FORM.credentialFields()
