/**
 * Orderchamp has no supported OAuth code-exchange flow here — see
 * ./connect-form.ts. The public multi-merchant OAuth flow exists but
 * requires Orderchamp partner approval and is out of scope (its
 * token-exchange endpoint is not independently confirmed). `getAuthUrl` /
 * `exchangeCode` exist only because `BaseAdapter` requires them.
 *
 * Docs: https://developers.orderchamp.com/authentication
 */
import type { Credentials } from '@opensteward/shared'

/** Informational only — the backoffice page where a private app token is created. */
export function buildAuthUrl(): string {
  return 'https://www.orderchamp.com/supplier/settings/api'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Orderchamp does not use OAuth code exchange in this adapter. Create a private app token ' +
      'in the Orderchamp backoffice API page, then submit it through the Connect Link form.',
  )
}
