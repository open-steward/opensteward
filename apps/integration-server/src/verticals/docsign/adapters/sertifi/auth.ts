/**
 * Sertifi auth helpers.
 *
 * Sertifi authenticates with a long-lived portal **API code** (apiKey
 * scheme) — not OAuth. The customer copies the code from their portal
 * (Administration → Account Settings) and pastes it into the Connect Link
 * form. The code is stored verbatim on `credentials.accessToken` and sent
 * on every request via the `sertifi-api-code` header.
 *
 * Because there is no OAuth flow, the `getAuthUrl`/`exchangeCode` surface
 * is satisfied by the `simpleApiKey` credential-form template wired in
 * `index.ts`; the helpers here only cover the no-op redirect target and the
 * refresh (API codes do not expire, so refresh returns the credentials
 * unchanged).
 *
 * Docs: https://supportcenter.sertifi.com/en/sertifi-api.html
 */

import type { Credentials } from '@opensteward/shared'
import { API_CODE_HELP_URL } from './constants'

/** No OAuth dance — point the customer at the portal page that shows the API code. */
export function buildAuthUrl(_state: string): string {
  return API_CODE_HELP_URL
}

/** API codes do not expire; nothing to refresh. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
