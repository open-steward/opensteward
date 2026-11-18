/**
 * Thirty Bees "auth" helpers.
 *
 * Thirty Bees uses a webservice key for HTTP Basic auth. Keys are generated
 * in the Thirty Bees back-office under Advanced Parameters > Webservice.
 * The key is used as the username with an empty password.
 *
 * There is no OAuth code-exchange flow. Credentials are passed to the
 * adapter via `POST /v1/connections` with
 * `{ platform: 'thirty-bees', credentials: { accessToken, extra: { baseUrl } } }`.
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(baseUrl: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${baseUrl.replace(/\/$/, '')}/admin/index.php?controller=AdminWebservice`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Thirty Bees does not use OAuth code exchange. ' +
      'Create a webservice key in Thirty Bees back-office → Advanced Parameters → Webservice, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "thirty-bees", credentials: {accessToken, extra: {baseUrl}}}`.',
  )
}
