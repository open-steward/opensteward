/**
 * FastSpring "auth" helpers.
 *
 * FastSpring does NOT use OAuth. Every merchant generates a single API
 * username/password pair (HTTP Basic) from their own dashboard under
 * Developer Tools → APIs → API Credentials — there is no per-connection
 * authorization-code flow to run. The adapter therefore:
 *
 *  - Points `getAuthUrl` at the API overview docs (informational only).
 *  - Throws from `exchangeCode` with clear instructions so ambiguous
 *    callers fail loudly instead of pretending to support OAuth.
 *
 * Real credentials are collected via the Connect Link credential form
 * (`credentialFields()` / `exchangeCredentials()` in ./index.ts) and passed
 * to `POST /v1/connections` as
 * `{ platform: 'fastspring', credentials: { apiUsername, apiPassword } }`.
 *
 * Docs: https://developer.fastspring.com/reference/api-overview
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return 'https://developer.fastspring.com/reference/api-overview'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'FastSpring does not use OAuth code exchange. ' +
      'Generate an API username/password pair in the FastSpring dashboard ' +
      'under Developer Tools → APIs → API Credentials, then POST them to ' +
      '/v1/connections with body ' +
      '`{platform: "fastspring", credentials: {apiUsername, apiPassword}}`.',
  )
}
