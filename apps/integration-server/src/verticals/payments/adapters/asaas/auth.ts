/**
 * Asaas authenticates with a single API key sent in the `access_token`
 * header (the raw key — no `Bearer` prefix). One key is one environment: a
 * `$aact_prod_…` key is bound to production and a `$aact_hmlg_…` key to
 * sandbox, so there is no separate host or mode flag to carry. There is no
 * OAuth flow and no refresh token — the key is the credential, so we stash it
 * verbatim on `accessToken`.
 *
 * Docs: https://docs.asaas.com/docs/authentication-2
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: (fields.apiKey ?? '').trim() }
}
