/**
 * PrestaShop "auth" helpers.
 *
 * PrestaShop uses a webservice key for HTTP Basic auth. Keys are generated
 * in the PrestaShop back-office under Advanced Parameters > Webservice.
 * The key is used as the username with an empty password.
 *
 * There is no OAuth code-exchange flow. Credentials are passed to the
 * adapter via `POST /v1/connections` with
 * `{ platform: 'prestashop', credentials: { apiKey, site } }`.
 */

import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(site: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${site.replace(/\/$/, '')}/admin/index.php?controller=AdminWebservice`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'PrestaShop does not use OAuth code exchange. ' +
      'Create a webservice key in PrestaShop back-office → Advanced Parameters → Webservice, ' +
      'then POST it to /v1/connections with body ' +
      '`{platform: "prestashop", credentials: {apiKey, site}}`.',
  )
}
