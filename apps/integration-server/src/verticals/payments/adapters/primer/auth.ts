/**
 * Primer authenticates every request with a single API key sent in the
 * `X-Api-Key` header — there is no OAuth flow and no token exchange. The key is
 * minted in the dashboard (Developers → API keys) and is environment-bound: a
 * production key only works against `api.primer.io`, a sandbox key only against
 * `api.sandbox.primer.io`.
 *
 * The Connect Link form therefore collects two fields — API key and environment
 * — and we stash them on the credential:
 *
 *   accessToken    → the API key (the long-lived secret, sent as X-Api-Key)
 *   extra.baseUrl  → the resolved environment host
 *
 * Docs: https://primer.io/docs/api-reference/get-started/authentication
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL } from './constants'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText:
      'Your Primer API key (Dashboard → Developers → API keys). Sandbox and production keys are separate — match it to the environment below.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: false,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox' },
    ],
    helpText: 'Pick "Sandbox" for sandbox keys; defaults to Production.',
  },
]

export function resolveBaseUrl(environment: string | undefined): string {
  return (environment ?? '').trim().toLowerCase() === 'sandbox' ? SANDBOX_BASE_URL : PROD_BASE_URL
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  return {
    accessToken: apiKey,
    extra: {
      baseUrl: resolveBaseUrl(fields.environment),
    },
  }
}
