/**
 * Network International (N-Genius Online) credential model — api_key style.
 *
 * N-Genius authenticates with a single **Service Account API key**. That key
 * is not sent on payment calls directly; instead it is a Basic-auth secret
 * POSTed to the identity service (`/identity/auth/access-token`) to mint a
 * short-lived (5-minute) bearer access token that is reused for the batch.
 *
 * Every payment-API path is also scoped to a merchant **outlet reference**
 * (the `outlets/{outletRef}` path segment), so the Connect Link form collects
 * three fields — the API key, the outlet reference, and the environment — and
 * we stash them on the credential:
 *
 *   accessToken              → the Service Account API key (the long-lived secret)
 *   extra.outletRef          → the merchant outlet reference (path scope)
 *   extra.baseUrl            → resolved environment host
 *
 * `accessToken` deliberately holds the *API key*, not a bearer token: the
 * bearer access token is minted lazily inside the client and re-minted on
 * expiry, so it never needs to be persisted. There is no OAuth flow.
 *
 * Docs: https://docs.ngenius-payments.com/reference/request-an-access-token-direct
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
      'Your N-Genius Service Account API key (portal → Integrations → API keys). Sandbox and production keys are separate — match it to the environment below.',
  },
  {
    name: 'outletRef',
    label: 'Outlet reference',
    type: 'text',
    required: true,
    placeholder: 'a3a9f2c0-...',
    helpText: 'The merchant outlet reference your orders are scoped to (portal → Organisation → Outlets).',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: false,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox (UAT)' },
    ],
    helpText: 'Pick "Sandbox" for UAT keys; defaults to Production.',
  },
]

export function resolveBaseUrl(environment: string | undefined): string {
  return (environment ?? '').trim().toLowerCase() === 'sandbox' ? SANDBOX_BASE_URL : PROD_BASE_URL
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const apiKey = (fields.apiKey ?? '').trim()
  const outletRef = (fields.outletRef ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  if (!outletRef) throw new Error('Outlet reference is required.')
  return {
    accessToken: apiKey,
    extra: {
      outletRef,
      baseUrl: resolveBaseUrl(fields.environment),
    },
  }
}
