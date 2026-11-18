/**
 * Quickbutik API key auth helpers.
 *
 * Quickbutik does NOT use OAuth2. Merchants generate an API key in their
 * Control Panel under Settings → API. The key is used as BOTH the HTTP
 * Basic Auth username and password (api_key:api_key, base64-encoded).
 *
 * Credentials are passed via `POST /v1/connections` with
 * `{ platform: 'quickbutik', credentials: { accessToken: '<api_key>' } }`.
 *
 * Docs: https://quickbutik.dev/api-v1/introduction
 */

import type { Credentials } from '@opensteward/shared'

/** Informational URL — Quickbutik has no OAuth authorize endpoint. */
export function buildAuthUrl(): string {
  return 'https://quickbutik.dev/api-v1/introduction'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Quickbutik does not use OAuth code exchange. ' +
      'Generate an API key in your Quickbutik Control Panel under Settings → API, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "quickbutik", credentials: {accessToken: "<api_key>"}}`.',
  )
}
