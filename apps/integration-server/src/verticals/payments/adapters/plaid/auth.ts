/**
 * Plaid authentication.
 *
 * Plaid is not OAuth from the integrator's side: every API call is
 * authenticated with a fixed `client_id` + `secret` pair (issued in the Plaid
 * Dashboard). Reads against a linked bank Item additionally require the
 * long-lived `access_token` minted for that Item. None of these expire, so
 * there is no token refresh.
 *
 * Because sandbox and production live on different hosts (and Items cannot be
 * moved between them), the Connect form also collects the environment so the
 * connection knows which host to call. All four values ride on the canonical
 * `Credentials`:
 *   - secret       → `accessToken`            (the value the platform keeps secret)
 *   - client_id    → `extra.clientId`
 *   - access_token → `extra.itemAccessToken`  (per-Item; optional for Transfer)
 *   - environment  → `extra.environment`      ('sandbox' | 'production')
 *
 * Docs: https://plaid.com/docs/api/
 */
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { PRODUCTION_BASE_URL, SANDBOX_BASE_URL } from './constants'

export type PlaidEnvironment = 'sandbox' | 'production'

/** Resolve the API host for a stored connection (defaults to sandbox). */
export function baseUrlFor(credentials: Credentials): string {
  return credentials.extra?.['environment'] === 'production'
    ? PRODUCTION_BASE_URL
    : SANDBOX_BASE_URL
}

/** The Plaid `client_id` for a stored connection. */
export function clientId(credentials: Credentials): string {
  return String(credentials.extra?.['clientId'] ?? '')
}

/** The Plaid `secret` for a stored connection. */
export function secret(credentials: Credentials): string {
  return credentials.accessToken
}

/** The per-Item `access_token`, if one was supplied. */
export function itemAccessToken(credentials: Credentials): string | undefined {
  const t = credentials.extra?.['itemAccessToken']
  return t ? String(t) : undefined
}

/**
 * Connect-form descriptor + exchange. A bespoke (vs. `simpleApiKey`) form
 * because Plaid needs the client_id alongside the secret, plus the
 * environment and an optional per-Item access token.
 */
export const FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Client ID',
      type: 'text',
      required: true,
      helpText: 'Your Plaid client_id. Found under Team Settings → Keys in the Plaid Dashboard.',
    },
    {
      name: 'secret',
      label: 'Secret',
      type: 'password',
      required: true,
      helpText: 'The secret for the selected environment (Sandbox / Production), from the Plaid Dashboard.',
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
      helpText: 'Items cannot be moved between environments; pick the one your secret belongs to.',
    },
    {
      name: 'itemAccessToken',
      label: 'Item access token',
      type: 'password',
      required: false,
      helpText: 'Optional. The long-lived access_token for a linked bank Item (needed for Item-scoped reads).',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const id = (fields['clientId'] ?? '').trim()
    const sec = (fields['secret'] ?? '').trim()
    if (!id) throw new Error('Client ID is required.')
    if (!sec) throw new Error('Secret is required.')
    const environment: PlaidEnvironment =
      fields['environment'] === 'production' ? 'production' : 'sandbox'
    const extra: Record<string, unknown> = { clientId: id, environment }
    const token = (fields['itemAccessToken'] ?? '').trim()
    if (token) extra['itemAccessToken'] = token
    return { accessToken: sec, extra }
  },
})
