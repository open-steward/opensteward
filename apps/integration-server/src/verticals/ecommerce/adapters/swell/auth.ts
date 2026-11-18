/**
 * Swell "auth" helpers.
 *
 * Swell uses API key authentication (store ID + secret key) rather than
 * OAuth2. Credentials are passed via `POST /v1/connections` with
 * `{ platform: 'swell', credentials: { storeId, secretKey } }`.
 *
 * The store ID is the HTTP Basic username and the secret key the password,
 * against the Backend API host https://api.swell.store (constants.ts).
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://swell.store/docs/api'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Swell does not use OAuth code exchange. ' +
      'Create API keys in your Swell dashboard under Developer → API keys, ' +
      'then POST them to /v1/connections with body ' +
      '`{platform: "swell", credentials: {storeId, secretKey}}`.',
  )
}
