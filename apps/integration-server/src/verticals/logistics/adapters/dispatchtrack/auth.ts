import type { Credentials } from '../../adapter/interface'
import { DISPATCHTRACK_DASHBOARD_URL } from './constants'

/**
 * DispatchTrack uses API-key authentication — not OAuth2.
 *
 * getAuthUrl:          Returns the DispatchTrack settings page (no redirect flow).
 * exchangeApiKey:      Treats the raw form submission (apiKey + accountCode) as
 *                      credentials directly.
 * refreshCredentials:  API keys do not expire — return unchanged.
 */

export function buildAuthUrl(_state: string): string {
  return DISPATCHTRACK_DASHBOARD_URL
}

export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const apiKey = (fields['apiKey'] ?? '').trim()
  const accountCode = (fields['accountCode'] ?? '').trim()
  if (!apiKey) throw new Error('API key is required.')
  if (!accountCode) throw new Error('Account code is required.')
  return {
    accessToken: apiKey,
    extra: { accountCode },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // DispatchTrack API keys do not expire.
  return credentials
}
