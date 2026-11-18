/**
 * Marketplacer has no OAuth authorization-code flow for the Seller API — see
 * ./connect-form.ts. `getAuthUrl` / `exchangeCode` exist only because
 * `BaseAdapter` requires them; they point callers at the Connect Link form
 * and the Seller Portal instead of doing anything themselves.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/getting_started/
 */
import type { Credentials } from '@opensteward/shared'

/** Informational only — the Seller Portal page where the API key is created. */
export function buildAuthUrl(instanceHost?: string): string {
  const host = instanceHost ?? 'your-instance.com'
  return `https://${host.replace(/^https?:\/\//, '')}/seller/api_access`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Marketplacer does not use OAuth code exchange. Generate a Seller API key in the ' +
      'Seller Portal (Extensions → API Access), then submit it — with your operator’s ' +
      'instance URL — through the Connect Link form.',
  )
}
