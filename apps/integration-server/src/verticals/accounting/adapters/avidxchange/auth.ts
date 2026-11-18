/**
 * AvidXchange authentication helpers.
 *
 * AvidXchange issues a static API key per partner integration. There is no
 * OAuth dance. The key is passed via the `x-api-key` request header.
 *
 * A `companyId` that scopes every request to a specific payer company is
 * stored in `credentials.extra.companyId`.
 */
import type { Credentials } from '../../adapter/interface'

/**
 * AvidXchange uses a credential form (no OAuth redirect).
 * Return a placeholder URL to satisfy the BaseAdapter interface.
 */
export function buildAuthUrl(_state: string): string {
  return '#'
}

/**
 * Called when the user submits the Connect Link credential form.
 * `apiKey` is the raw API key; `companyId` is the payer company identifier.
 */
export async function exchangeCredentialsFromForm(
  apiKey: string,
  companyId: string,
): Promise<Credentials> {
  return {
    accessToken: apiKey.trim(),
    extra: { companyId: companyId.trim() },
  }
}

/**
 * API keys do not expire — return the credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
