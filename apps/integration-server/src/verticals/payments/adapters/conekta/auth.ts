/**
 * Conekta authenticates with a single private API key sent as a Bearer
 * token: `Authorization: Bearer key_xxxxxxxxxxxxxx`. (The legacy HTTP-Basic
 * form — key as the username with an empty password — is still accepted, but
 * Bearer is the documented current standard.)
 *
 * One key is one environment: a `key_` minted in the Conekta panel is bound
 * to either sandbox or live, so there is no separate host or mode flag to
 * carry. There is no OAuth flow and no refresh token — the key is the
 * credential, so we stash it verbatim on `accessToken`.
 *
 * Docs: https://developers.conekta.com/reference/autenticaci%C3%B3n
 */
import type { Credentials } from '@opensteward/shared'

export function buildCredentials(fields: Record<string, string>): Credentials {
  return { accessToken: (fields.apiKey ?? '').trim() }
}
