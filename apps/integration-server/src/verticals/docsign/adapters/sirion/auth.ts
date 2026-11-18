/**
 * Sirion (SirionOne) OAuth 2.0 helpers.
 *
 * Sirion's B2B API uses the OAuth 2.0 client-credentials grant: a client
 * admin generates an OAuth Client ID + Client Secret under Admin 2.0 → OAuth
 * Client Setup, and those are POSTed to the tenant's `/oauth/token` endpoint
 * for a Bearer access token. There is no interactive authorization-code
 * redirect and no end-user consent screen — the grant is machine-to-machine.
 *
 * The token endpoint is tenant-scoped, so the SirionOne host is supplied per
 * connection on the Connect form and stored on `credentials.extra.baseUrl`.
 * `clientId` / `clientSecret` are also stored on `extra` so
 * `refreshCredentials` can re-run the grant without re-prompting
 * (client-credentials tokens are not refreshable via a refresh_token — you
 * simply request a fresh one).
 *
 * The hosted Connect page collects `baseUrl` + `clientId` + `clientSecret`
 * via `credentialFields()` / `exchangeCredentials()` (the
 * `oauth2ClientCredentials` helper wires those up). Instance-config callers
 * can still call `requestToken` directly.
 *
 * Refs: Sirion B2B API OAuth Client Setup (Admin 2.0).
 */

import type { CredentialField, Credentials } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { OAUTH_TOKEN_PATH, DEFAULT_BASE_URL, DEFAULT_SCOPES } from './constants'

// ── Connect-form helpers ───────────────────────────────────────────────────

const BASE_URL_FIELD: CredentialField = {
  name: 'baseUrl',
  label: 'SirionOne tenant URL',
  type: 'url',
  placeholder: 'https://acme.sirion.ai',
  helpText:
    'The base URL of your SirionOne tenant (e.g. https://acme.sirion.ai). Found under Admin 2.0 → OAuth Client Setup.',
  required: true,
}

const FORM = oauth2ClientCredentials({
  tokenUrl: (input) => {
    const base = (input['baseUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    return `${base}${OAUTH_TOKEN_PATH}`
  },
  scopes: DEFAULT_SCOPES,
  additionalFields: [BASE_URL_FIELD],
  buildExtra: (input) => ({
    baseUrl: (input['baseUrl'] ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    clientId: input['clientId'] ?? '',
    clientSecret: input['clientSecret'] ?? '',
  }),
})

export function credentialFields(): CredentialField[] {
  return FORM.credentialFields()
}

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  return FORM.exchangeCredentials(fields)
}

// ── Token helpers (also used by instance-config path) ─────────────────────

/**
 * Re-run the client-credentials grant. Sirion does not issue refresh tokens
 * for this grant; a new access token is minted from the stored client
 * credentials and tenant host on `credentials.extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const baseUrl = String(extra['baseUrl'] ?? DEFAULT_BASE_URL)
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  if (!clientId || !clientSecret) return credentials
  return FORM.exchangeCredentials({ baseUrl, clientId, clientSecret })
}
