/**
 * KORONA POS auth helpers.
 *
 * KORONA authenticates with HTTP Basic (`securitySchemes.basicAuth` on
 * https://128.koronacloud.com/web/api/v3/openapi.json) using API
 * credentials the merchant creates in Settings → Data Exchange → API (see
 * https://manual.koronapos.com/korona-cloud-api-v3/). There is no OAuth
 * flow — credentials are collected directly via `./connect-form.ts`.
 *
 * `getAuthUrl` / `exchangeCode` exist only to satisfy `BaseAdapter`; they
 * are never reachable for a `basic` platform. Same shape as
 * `apps/integration-server/src/verticals/ecommerce/adapters/insales/auth.ts`.
 */

import type { Credentials } from '@opensteward/shared'

/** Informational documentation URL — there is no OAuth authorize redirect to build. */
export function buildAuthUrl(): string {
  return 'https://manual.koronapos.com/korona-cloud-api-v3/'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'KORONA POS does not use OAuth code exchange. Create API credentials in ' +
      'Settings → Data Exchange → API, then POST them to /v1/connections with body ' +
      '`{ platform: "korona-pos", credentials: { host, koronaAccountId, username, password } }`.',
  )
}
