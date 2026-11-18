/**
 * Swisscom Trust Services (AIS) auth — OAuth2 client-credentials grant.
 *
 * AIS has no interactive user-consent flow: the Application Provider (AP)
 * authenticates machine-to-machine. The modern Trust Services estate exposes
 * a client-credentials token endpoint; the issued bearer token is sent to the
 * AIS REST endpoints as `Authorization: Bearer <token>`. (The legacy estate
 * used mTLS client certificates instead of bearer tokens.)
 *
 * We build the Connect-Link credential form + the client-credentials exchange
 * from the shared `oauth2ClientCredentials` template, then re-run the grant on
 * refresh using the clientId/clientSecret persisted on `credentials.extra`.
 *
 * Docs: https://dev.trustservices.swisscom.com/
 */

import type { Credentials, CredentialField } from '@opensteward/shared'
import { oauth2ClientCredentials } from '@opensteward/shared'
import {
  DEFAULT_BASE_URL,
  DEFAULT_SCOPES,
  OAUTH_TOKEN_URL,
  PROD_BASE_URL,
  TEST_BASE_URL,
} from './constants'

/**
 * Customer picks the AIS environment + supplies their AIS Claimed Identity.
 * The Claimed Identity authorizes the signing request (it is not a secret, but
 * AIS rejects requests whose Claimed Identity does not match the credential).
 */
const ADDITIONAL_FIELDS: CredentialField[] = [
  {
    name: 'baseUrl',
    label: 'AIS environment',
    type: 'select',
    required: true,
    helpText: 'Pick production or the pre-production test estate.',
    options: [
      { value: PROD_BASE_URL, label: 'Production (ais.swisscom.com)' },
      { value: TEST_BASE_URL, label: 'Test (ais.pre.swisscom.com)' },
    ],
  },
  {
    name: 'claimedIdentity',
    label: 'Claimed Identity',
    type: 'text',
    required: true,
    placeholder: 'ACME:OnDemand-Advanced',
    helpText: 'The AIS Claimed Identity Swisscom assigned to your service.',
  },
]

/** Shared client-credentials helper — exposes credentialFields + exchange. */
export const SWISSCOM_TRUST_SERVICES_CREDENTIAL_FORM = oauth2ClientCredentials({
  tokenUrl: OAUTH_TOKEN_URL,
  scopes: DEFAULT_SCOPES,
  additionalFields: ADDITIONAL_FIELDS,
  buildExtra: (fields) => ({
    clientId: (fields['clientId'] ?? '').trim(),
    clientSecret: fields['clientSecret'] ?? '',
    baseUrl: (fields['baseUrl'] ?? '').trim() || DEFAULT_BASE_URL,
    claimedIdentity: (fields['claimedIdentity'] ?? '').trim(),
  }),
})

/**
 * Re-run the client-credentials grant. AIS bearer tokens are short-lived and
 * carry no refresh token, so we re-exchange the persisted clientId/clientSecret
 * (and re-attach the customer's baseUrl + claimedIdentity to `extra`).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  if (!clientId || !clientSecret) return credentials
  const refreshed = await SWISSCOM_TRUST_SERVICES_CREDENTIAL_FORM.exchangeCredentials({
    clientId,
    clientSecret,
    baseUrl: String(extra['baseUrl'] ?? DEFAULT_BASE_URL),
    claimedIdentity: String(extra['claimedIdentity'] ?? ''),
  })
  return { ...refreshed, extra: { ...extra, ...(refreshed.extra ?? {}) } }
}
