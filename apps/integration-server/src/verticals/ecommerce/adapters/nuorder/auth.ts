/**
 * NuORDER auth helpers.
 *
 * NuORDER does not use an OAuth2 authorization-code flow. It signs every
 * request with static, per-brand OAuth 1.0a credentials (consumer key/secret,
 * token/token secret) generated once in Brand Admin → Settings → API
 * Management (https://assets.nuorder.com/api-docs/index.html). `getAuthUrl` /
 * `exchangeCode` exist only to satisfy `BaseAdapter` and fail loudly if ever
 * reached — the real flow is the Connect Link credential form (see index.ts).
 */
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  return 'https://nuorder.com/'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'NuORDER does not use OAuth code exchange. Generate OAuth 1.0a credentials ' +
      '(Brand Admin → Settings → API Management) and POST them to /v1/connections ' +
      'with credentials: { consumerKey, consumerSecret, token, tokenSecret, environment }.',
  )
}
