/**
 * Bitso Business credential model.
 *
 * Bitso authenticates every request with API-key request-signing rather than
 * OAuth or a single bearer token: each call carries an
 * `Authorization: Bitso <key>:<nonce>:<signature>` header where the signature
 * is an HMAC-SHA256 of `nonce + method + requestPath + body` keyed by the API
 * *secret* (see {@link ./client.ts}). The integration therefore needs BOTH the
 * API key and the API secret, plus the environment (production vs. staging) so
 * the client can target the right host.
 *
 * We collect all three through the Connect Link form via the shared
 * `customForm` template and map them onto `Credentials`:
 *   - `accessToken`     → API key      (the public identifier in the header)
 *   - `extra.apiSecret` → API secret   (the HMAC signing key)
 *   - `extra.baseUrl`   → resolved host (production or staging)
 *
 * Docs: https://docs.bitso.com/bitso-api/docs/create-signed-requests
 */
import { customForm, type CredentialField, type Credentials } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, STAGING_BASE_URL } from './constants'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText: 'Generate API credentials in the Bitso dashboard under Settings → API.',
  },
  {
    name: 'apiSecret',
    label: 'API secret',
    type: 'password',
    required: true,
    helpText: 'Shown once when the API key is created. Used to sign every request.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'production', label: 'Production (api.bitso.com)' },
      { value: 'staging', label: 'Staging (stage.bitso.com)' },
    ],
    helpText: 'Use staging while developing against test credentials.',
  },
]

/** Resolve the REST host from the submitted `environment` field. */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'staging' ? STAGING_BASE_URL : PRODUCTION_BASE_URL
}

export const CREDENTIAL_FORM = customForm({
  fields: CREDENTIAL_FIELDS,
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields.apiKey ?? '').trim()
    const apiSecret = (fields.apiSecret ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!apiSecret) throw new Error('API secret is required.')
    return {
      accessToken: apiKey,
      extra: {
        apiSecret,
        environment: fields.environment ?? 'production',
        baseUrl: baseUrlFor(fields.environment),
      },
    }
  },
})
