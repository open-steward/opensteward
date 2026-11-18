/**
 * Stampli authentication helpers.
 *
 * Stampli issues a static API key per partner integration. There is no OAuth
 * redirect dance. The key is sent as a Bearer token in the `Authorization`
 * header on every request.
 *
 * An optional `companyId` scopes requests to a specific payer company and
 * is stored in `credentials.extra.companyId`.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * Stampli uses a credential form (no OAuth redirect).
 * Return a placeholder URL to satisfy the BaseAdapter interface.
 */
export function buildAuthUrl(_state: string): string {
  return '#'
}

/**
 * API keys do not expire — return the credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
