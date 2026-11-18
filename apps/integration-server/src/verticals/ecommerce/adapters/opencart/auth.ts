/**
 * OpenCart "auth" helpers.
 *
 * OpenCart uses API key authentication. Credentials are generated in the
 * admin panel under System → Users → API. The API key is passed as a
 * query parameter or header to authenticate requests.
 *
 * There is no OAuth2 code-exchange flow. Credentials are passed to the
 * adapter via `POST /v1/connections` with
 * `{ platform: 'opencart', credentials: { apiKey, site } }`.
 *
 * Docs: https://docs.opencart.com/en-gb/system/users/api/
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(site: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${site.replace(/\/$/, '')}/admin/index.php?route=user/api`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'OpenCart does not use OAuth code exchange. ' +
      'Create an API key in OpenCart admin → System → Users → API, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "opencart", credentials: {apiKey, site}}`.',
  )
}
