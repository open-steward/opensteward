import type { Credentials } from '../../adapter/interface'
import { SENPEX_DASHBOARD_URL } from './constants'

/**
 * Senpex authentication uses two static header credentials:
 *   - `clientid`  — client identifier issued by Senpex
 *   - `secretid`  — secret key issued by Senpex
 *
 * There is no OAuth flow or token refresh. Both values are stored in
 * `credentials.extra` and forwarded as request headers by the client.
 */

export function buildAuthUrl(_state: string): string {
  return SENPEX_DASHBOARD_URL
}

export async function exchangeApiKeys(
  clientId: string,
  secretId: string,
): Promise<Credentials> {
  if (!clientId || !secretId) {
    throw new Error('Senpex: clientid and secretid are both required.')
  }
  return {
    accessToken: clientId,
    extra: { clientId, secretId },
  }
}

/**
 * Senpex credentials do not expire — return unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
