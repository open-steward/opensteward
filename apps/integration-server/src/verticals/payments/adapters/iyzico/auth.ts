/**
 * iyzico authenticates every API call with a per-request HMACSHA256 signature,
 * not a static bearer token and not OAuth. Each request carries an
 * `Authorization: IYZWSv2 <base64>` header where the signed payload is
 * `HMACSHA256(randomKey + uriPath + requestBody, secretKey)` — so the client
 * needs BOTH the public `apiKey` and the secret `secretKey` on every call.
 *
 * Sandbox and production live on separate hosts, so the Connect form also
 * collects the environment. All three values ride on the canonical
 * `Credentials`:
 *   - apiKey      → `accessToken`
 *   - secretKey   → `extra.secretKey`   (used to sign requests + verify webhooks)
 *   - environment → `extra.environment` ('sandbox' | 'production')
 *
 * Docs: https://docs.iyzico.com/en/getting-started/preliminaries/authentication/hmacsha256-auth
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export type IyzicoEnvironment = 'sandbox' | 'production'

/** Resolve the API host for a stored connection (defaults to sandbox). */
export function baseUrlFor(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return env === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/** The public API key for a stored connection. */
export function apiKeyFor(credentials: Credentials): string {
  return credentials.accessToken
}

/** The secret key for a stored connection (request signing + webhook verify). */
export function secretKeyFor(credentials: Credentials): string {
  const secret = credentials.extra?.['secretKey']
  return typeof secret === 'string' ? secret : ''
}

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because iyzico needs the secret key (for signing) and the environment
 * alongside the public API key.
 */
export const FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API key',
      type: 'text',
      required: true,
      helpText: 'Your iyzico API key. Found under Settings → Merchant in the iyzico Dashboard.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'Your iyzico secret key (unique + secret). Used to sign every API request.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'sandbox', label: 'Sandbox (test)' },
        { value: 'production', label: 'Production (live)' },
      ],
      helpText: 'Sandbox uses test keys against sandbox-api.iyzipay.com; Production requires onboarded live keys.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const secretKey = (fields['secretKey'] ?? '').trim()
    if (!apiKey) throw new Error('API key is required.')
    if (!secretKey) throw new Error('Secret key is required.')
    const environment: IyzicoEnvironment =
      fields['environment'] === 'production' ? 'production' : 'sandbox'
    return { accessToken: apiKey, extra: { secretKey, environment } }
  },
})
