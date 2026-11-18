/**
 * Crystallize auth helpers.
 *
 * Crystallize has no OAuth flow for third-party apps. API access is an access
 * token pair — an ID and a secret — created in the Crystallize app and sent on
 * every request as `X-Crystallize-Access-Token-Id` and
 * `X-Crystallize-Access-Token-Secret`. Every API URL also carries the tenant
 * identifier (`https://api.crystallize.com/{tenant}/catalogue`).
 *
 * All three are the customer's, so Connect Link collects them on the
 * credential form. The secret is stored as `accessToken`; the tenant and the
 * token ID live in `credentials.extra`.
 *
 * Docs: https://crystallize.com/docs/developer/apis/authentication
 */

import type { CredentialField, Credentials } from '@opensteward/shared'

export const NO_REDIRECT_MESSAGE =
  'Crystallize uses access tokens created in the Crystallize app: use the credential form (tenant identifier, access token ID and secret), not a browser redirect.'

/** The tenant is spliced into API paths: a single, plain path segment only. */
const TENANT_IDENTIFIER = /^[A-Za-z0-9_-]+$/

/** `acme`, ` @acme ` → `acme`. Rejects blanks and anything that is not a plain path segment. */
export function normaliseTenantIdentifier(raw: unknown): string {
  const value = (typeof raw === 'string' ? raw : '').trim().replace(/^@/, '')
  if (!value) throw new Error('Crystallize tenant identifier is required.')
  if (!TENANT_IDENTIFIER.test(value)) {
    throw new Error(
      'Crystallize tenant identifier must contain only letters, digits, hyphens and underscores.',
    )
  }
  return value
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'tenantIdentifier',
    label: 'Tenant identifier',
    type: 'text',
    required: true,
    placeholder: 'my-tenant',
    helpText: 'Your tenant’s identifier, as shown in the Crystallize app’s settings.',
  },
  {
    name: 'accessTokenId',
    label: 'Access token ID',
    type: 'text',
    required: true,
    helpText: 'Create an access token in the Crystallize app under your user’s access tokens.',
  },
  { name: 'accessTokenSecret', label: 'Access token secret', type: 'password', required: true },
]

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const tenantIdentifier = normaliseTenantIdentifier(fields?.['tenantIdentifier'])
  const accessTokenId = (fields?.['accessTokenId'] ?? '').trim()
  const accessTokenSecret = (fields?.['accessTokenSecret'] ?? '').trim()
  if (!accessTokenId || !accessTokenSecret) {
    throw new Error('Crystallize access token ID and secret are required.')
  }
  return {
    accessToken: accessTokenSecret,
    extra: { tenantIdentifier, accessTokenId },
  }
}
