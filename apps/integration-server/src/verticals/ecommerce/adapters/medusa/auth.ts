/**
 * Medusa "auth" helpers.
 *
 * Medusa uses API keys (secret keys) created in the admin dashboard.
 * There is no OAuth2 authorization-code flow. The adapter:
 *
 *  - Points `getAuthUrl` at the Medusa admin settings page (informational).
 *  - Throws from `exchangeCode` with clear instructions.
 *
 * Credentials are passed via `POST /v1/connections` with
 * `{ platform: 'medusa', credentials: { apiKey, host } }`.
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(host: string): string {
  return `${host.replace(/\/$/, '')}/app/settings/api-key-management`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Medusa does not use OAuth code exchange. ' +
      'Create an API key in the Medusa admin dashboard under Settings → API Key Management, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "medusa", credentials: {apiKey, host}}`.',
  )
}
