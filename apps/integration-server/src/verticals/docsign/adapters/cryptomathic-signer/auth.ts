/**
 * Cryptomathic Signer auth — OAuth 2.0 client-credentials grant.
 *
 * Cryptomathic Signer authorises CSC API access machine-to-machine: there is
 * no interactive end-user consent flow at the adapter level (per-credential
 * end-user authorization is handled inside Signer's own signing ceremony).
 * The CSC `info` method reports `authType: "oauth2client"`; the issued bearer
 * token is presented to the `/csc/v2/...` endpoints as
 * `Authorization: Bearer <token>` (RFC 6750).
 *
 * Each Signer deployment is hosted by its own TSP, so the customer supplies
 * their RSSP base URL on the Connect-Link form. The OAuth 2.0 token endpoint
 * is the CSC `oauth2/token` path concatenated to that base URL. We build the
 * credential form + client-credentials exchange from the shared
 * `oauth2ClientCredentials` template, then re-run the grant on refresh using
 * the clientId/clientSecret persisted on `credentials.extra`.
 *
 * Docs: https://cloudsignatureconsortium.org/resources/ (§8.4 oauth2/token)
 */

import type { Credentials, CredentialField } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import { DEFAULT_BASE_URL, DEFAULT_SCOPES } from './constants'

/** Normalise a customer-supplied base URL (strip trailing slash). */
export function normalizeBaseUrl(input: string | undefined): string {
  const raw = (input ?? '').trim() || DEFAULT_BASE_URL
  return raw.replace(/\/+$/, '')
}

/**
 * The CSC OAuth 2.0 token endpoint: `oauth2/token` concatenated to the OAuth
 * authorization-server base URI. For a single-issuer RSSP this coincides with
 * the RSSP base URL the customer typed into the form.
 */
export function tokenUrlFor(input: Record<string, string>): string {
  return `${normalizeBaseUrl(input['baseUrl'])}/oauth2/token`
}

/**
 * The customer picks their Signer RSSP base URL and the userID whose signing
 * credentials should be surfaced. With the `oauth2client` (non-user-specific)
 * service authorization the userID is NOT implicit in the access token, so it
 * MUST be supplied to enumerate a user's credentials.
 */
const ADDITIONAL_FIELDS: CredentialField[] = [
  {
    name: 'baseUrl',
    label: 'Signer RSSP base URL',
    type: 'text',
    required: true,
    placeholder: 'https://signer.your-tsp.example',
    helpText:
      'The base URL of your Cryptomathic Signer deployment. The CSC API is reached at <baseUrl>/csc/v2.',
  },
  {
    name: 'userID',
    label: 'User identifier',
    type: 'text',
    required: true,
    helpText:
      'The credential-owner identifier whose signing credentials should be listed (CSC userID).',
  },
]

/** Shared client-credentials helper — exposes credentialFields + exchange. */
export const CRYPTOMATHIC_SIGNER_CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: tokenUrlFor,
  scopes: DEFAULT_SCOPES,
  additionalFields: ADDITIONAL_FIELDS,
  buildExtra: (fields) => ({
    clientId: (fields['clientId'] ?? '').trim(),
    clientSecret: fields['clientSecret'] ?? '',
    baseUrl: normalizeBaseUrl(fields['baseUrl']),
    userID: (fields['userID'] ?? '').trim(),
  }),
})

/**
 * Re-run the client-credentials grant. CSC service tokens are short-lived and
 * carry no refresh token, so we re-exchange the persisted clientId/clientSecret
 * (and re-attach the customer's baseUrl + userID to `extra`).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  if (!clientId || !clientSecret) return credentials
  const refreshed = await CRYPTOMATHIC_SIGNER_CREDENTIAL_FORM.exchangeCredentials({
    clientId,
    clientSecret,
    baseUrl: normalizeBaseUrl(String(extra['baseUrl'] ?? '')),
    userID: String(extra['userID'] ?? ''),
  })
  return { ...refreshed, extra: { ...extra, ...(refreshed.extra ?? {}) } }
}
