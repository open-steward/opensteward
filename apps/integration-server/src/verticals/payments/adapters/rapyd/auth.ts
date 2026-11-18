/**
 * Rapyd authentication — `api_key` model with per-request HMAC signing.
 *
 * Rapyd does NOT use OAuth or a bearer token. Every request carries a fresh
 * HMAC-SHA256 signature computed from the request, the organization's
 * `access_key`, and its `secret_key` (see `client.ts` for the signing). So the
 * adapter collects three static values through the Connect Link form:
 *   - access_key  → stored on `credentials.accessToken`
 *   - secret_key  → stored on `credentials.extra.secretKey` (used as the HMAC key)
 *   - environment → stored on `credentials.extra.environment` ('sandbox' | 'production')
 *
 * Sandbox and production are separate hosts, so the environment rides on the
 * connection to pick the host at call time.
 *
 * Docs: https://docs.rapyd.net/en/request-signatures.html
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export type RapydEnvironment = 'sandbox' | 'production'

/** Resolve the API host for a stored connection (defaults to sandbox). */
export function baseUrlFor(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return env === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/** The organization access key for a stored connection. */
export function accessKey(credentials: Credentials): string {
  return credentials.accessToken
}

/** The organization secret key — used as the HMAC key when signing requests. */
export function secretKey(credentials: Credentials): string {
  const value = credentials.extra?.['secretKey']
  return typeof value === 'string' ? value : ''
}

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because Rapyd needs the secret key and environment alongside the access key.
 */
export const FORM = customForm({
  fields: [
    {
      name: 'accessKey',
      label: 'Access key',
      type: 'text',
      required: true,
      helpText: 'Your Rapyd organization access key, from the Client Portal → Developers → Credentials.',
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      required: true,
      helpText: 'Your Rapyd organization secret key. Used to sign every API request; never leaves the server.',
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
      helpText: 'Sandbox uses https://sandboxapi.rapyd.net; production uses https://api.rapyd.net.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const access = (fields['accessKey'] ?? '').trim()
    const secret = (fields['secretKey'] ?? '').trim()
    if (!access) throw new Error('Access key is required.')
    if (!secret) throw new Error('Secret key is required.')
    const environment: RapydEnvironment =
      fields['environment'] === 'production' ? 'production' : 'sandbox'
    return { accessToken: access, extra: { secretKey: secret, environment } }
  },
})
