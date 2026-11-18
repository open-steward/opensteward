/**
 * Helcim authenticates with a single API token sent in the `api-token` request
 * header (NOT an `Authorization: Bearer` header). The merchant mints the token
 * in the Helcim panel under All Tools → Integrations → API Access
 * Configurations.
 *
 * One token is one account context: the token is bound to the merchant account
 * it was created in, so there is no separate host or environment flag to carry.
 * There is no OAuth flow and no refresh token — the token is the credential, so
 * we stash it verbatim on `accessToken`.
 *
 * Docs: https://devdocs.helcim.com/docs/authentication-with-the-helcim-api-and-helcimpayjs
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: (fields.apiToken ?? '').trim() }
}
