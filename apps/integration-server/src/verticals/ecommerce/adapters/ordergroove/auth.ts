/**
 * Ordergroove has no OAuth authorization-code flow. Access is a static
 * `x-api-key` issued per merchant from the Ordergroove Admin (Developers →
 * API Keys) — https://developer.ordergroove.com/reference/authentication.
 *
 * `getAuthUrl` returns the admin page where that key is generated
 * (informational only — the Connect page never renders it for an
 * `auth_type: api_key` platform); `exchangeCode` throws so a caller that
 * somehow reaches it fails loudly instead of silently doing nothing.
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://developer.ordergroove.com/reference/authentication'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Ordergroove does not use OAuth code exchange. Generate an API key in the ' +
      'Ordergroove Admin (Developers → API Keys) and submit it via the Connect ' +
      'Link credential form instead.',
  )
}
