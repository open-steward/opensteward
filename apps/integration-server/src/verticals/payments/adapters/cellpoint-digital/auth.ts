/**
 * CellPoint Digital (Velocity / mPoint) authentication.
 *
 * Every Velocity request carries TWO complementary credentials:
 *
 *   1. Authorization: Basic {base64(apiUsername:apiPassword)}
 *      Standard HTTP Basic auth. CellPoint issues the username + password
 *      during onboarding.
 *
 *   2. x-cpm-sec-token: SHA-256( bodyWithoutSpaces + salt )
 *      A per-request integrity token. The body string has all whitespace
 *      stripped, the merchant `salt` is appended, and the SHA-256 hex digest
 *      becomes the header value. The signing is implemented in `client.ts`.
 *
 * In addition, two account identifiers are required on the wire / in URLs:
 *   - `client-id` — the merchant's unique Velocity account ID.
 *   - `account`   — the unique storefront identifier.
 *
 * The merchant also picks an environment (`sandbox` UAT host vs `production`).
 * All of these are collected through the Connect Link form and stored on
 * `credentials`: the Basic-auth username lives on `accessToken`, everything
 * else lives on `credentials.extra`.
 *
 * Docs: https://documentation.cellpointdigital.com/docs/getting-started
 *       https://documentation.cellpointdigital.com/docs/api
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PROD_BASE_URL, SANDBOX_BASE_URL } from './constants'

/** The Basic-auth API username (stored on `accessToken`). */
export function apiUsername(credentials: Credentials): string {
  return credentials.accessToken
}

/** The Basic-auth API password. */
export function apiPassword(credentials: Credentials): string {
  const value = credentials.extra?.['apiPassword']
  return typeof value === 'string' ? value : ''
}

/** The HMAC salt used to build the `x-cpm-sec-token` request integrity token. */
export function salt(credentials: Credentials): string {
  const value = credentials.extra?.['salt']
  return typeof value === 'string' ? value : ''
}

/** The merchant's Velocity `client-id`. */
export function clientId(credentials: Credentials): string {
  const value = credentials.extra?.['clientId']
  return typeof value === 'string' ? value : ''
}

/** The storefront `account` identifier. */
export function account(credentials: Credentials): string {
  const value = credentials.extra?.['account']
  return typeof value === 'string' ? value : ''
}

/** Resolve the mPoint host for this connection (sandbox UAT vs production). */
export function baseUrl(credentials: Credentials): string {
  const env = credentials.extra?.['environment']
  return env === 'production' ? PROD_BASE_URL : SANDBOX_BASE_URL
}

/**
 * Connect-form descriptor + exchange. CellPoint requires the Basic-auth
 * username + password, the merchant `client-id`, the storefront `account`,
 * the HMAC `salt`, and an environment toggle.
 */
export const FORM = customForm({
  fields: [
    {
      name: 'apiUsername',
      label: 'API username',
      type: 'text',
      required: true,
      helpText: 'Your Velocity API username, issued by CellPoint Digital. Used for HTTP Basic authentication.',
    },
    {
      name: 'apiPassword',
      label: 'API password',
      type: 'password',
      required: true,
      helpText: 'Your Velocity API password. Combined with the username for HTTP Basic authentication.',
    },
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Your unique Velocity account ID (client-id), issued by CellPoint Digital.',
    },
    {
      name: 'account',
      label: 'Account',
      type: 'text',
      required: true,
      helpText: 'Your storefront identifier (account), issued by CellPoint Digital.',
    },
    {
      name: 'salt',
      label: 'HMAC salt',
      type: 'password',
      required: true,
      helpText: 'The merchant salt used to compute the x-cpm-sec-token integrity header on every request; never leaves the server.',
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      required: true,
      options: [
        { value: 'sandbox', label: 'Sandbox (UAT)' },
        { value: 'production', label: 'Production' },
      ],
      helpText: 'Which CellPoint mPoint host to target.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const username = (fields['apiUsername'] ?? '').trim()
    const password = (fields['apiPassword'] ?? '').trim()
    const client = (fields['clientId'] ?? '').trim()
    const acct = (fields['account'] ?? '').trim()
    const hmacSalt = (fields['salt'] ?? '').trim()
    const environment = (fields['environment'] ?? 'sandbox').trim() === 'production' ? 'production' : 'sandbox'
    if (!username) throw new Error('API username is required.')
    if (!password) throw new Error('API password is required.')
    if (!client) throw new Error('Client ID is required.')
    if (!acct) throw new Error('Account is required.')
    if (!hmacSalt) throw new Error('HMAC salt is required.')
    return {
      accessToken: username,
      extra: { apiPassword: password, clientId: client, account: acct, salt: hmacSalt, environment },
    }
  },
})
