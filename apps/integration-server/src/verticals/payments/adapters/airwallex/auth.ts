/**
 * Airwallex authenticates with a client-id + api-key pair rather than a single
 * bearer secret. The pair is exchanged at `POST /api/v1/authentication/login`
 * (headers `x-client-id` / `x-api-key`) for a short-lived bearer **token**
 * that is valid ~30 minutes and reused for every subsequent call.
 *
 * The api-key pair is environment-bound: a pair minted in the production web
 * app only works against `api.airwallex.com`, a demo pair only against
 * `api-demo.airwallex.com`. So the Connect Link form collects three fields —
 * client id, api key, and environment — and we stash them on the credential:
 *
 *   accessToken          → the api key (the long-lived secret)
 *   extra.clientId       → the client id
 *   extra.baseUrl        → resolved environment host
 *
 * `accessToken` deliberately holds the *api key*, not a bearer token: the
 * bearer token is minted lazily inside the client and refreshed on expiry,
 * so it never needs to be persisted. There is no OAuth flow.
 *
 * Docs: https://www.airwallex.com/docs/developer-tools/api/manage-api-keys
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { PROD_BASE_URL, DEMO_BASE_URL } from './constants'

export const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    placeholder: 'BIjjMYsYTGW...',
    helpText: 'Your Airwallex Client ID (Account settings → API keys).',
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    required: true,
    helpText:
      'Your Airwallex API key. Production and demo keys are separate — match it to the environment below.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: false,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'demo', label: 'Demo (sandbox)' },
    ],
    helpText: 'Pick "Demo" for sandbox keys; defaults to Production.',
  },
]

export function resolveBaseUrl(environment: string | undefined): string {
  return (environment ?? '').trim().toLowerCase() === 'demo' ? DEMO_BASE_URL : PROD_BASE_URL
}

export function buildCredentials(fields: Record<string, string>): Credentials {
  const clientId = (fields.clientId ?? '').trim()
  const apiKey = (fields.apiKey ?? '').trim()
  if (!clientId) throw new Error('Client ID is required.')
  if (!apiKey) throw new Error('API key is required.')
  return {
    accessToken: apiKey,
    extra: {
      clientId,
      baseUrl: resolveBaseUrl(fields.environment),
    },
  }
}
