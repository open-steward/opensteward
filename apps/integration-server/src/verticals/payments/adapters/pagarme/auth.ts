/**
 * Pagar.me authenticates with a single secret API key sent via HTTP Basic
 * Authentication: the secret key is the **username** and the password is
 * **empty**, i.e. `Authorization: Basic base64(secretKey:)`.
 *
 * One key is one environment: a `sk_test_…` key targets the sandbox and a
 * `sk_…` key targets production, so there is no separate host or mode flag to
 * carry. There is no OAuth flow and no refresh token — the key *is* the
 * credential, so we stash it verbatim on `accessToken` and the client builds
 * the Basic header from it.
 *
 * Docs: https://docs.pagar.me/reference/autenticação-2
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: (fields.secretKey ?? '').trim() }
}

/** Encode the secret key into the HTTP Basic credential `base64(key:)`. */
export function basicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`
}
