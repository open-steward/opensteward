import type { Credentials } from '../../adapter/interface'
import { BRING_DASHBOARD_URL } from './constants'

/**
 * Bring uses API Key + customer UID. The accessToken stores "email:apiKey".
 */

export function buildAuthUrl(_state: string): string {
  return BRING_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is expected to be "email:apiKey"
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Parse the stored "email:apiKey" credential into its components.
 */
export function parseCredentials(accessToken: string): { uid: string; apiKey: string } {
  const colonIdx = accessToken.indexOf(':')
  if (colonIdx === -1) {
    return { uid: accessToken, apiKey: '' }
  }
  return {
    uid: accessToken.substring(0, colonIdx),
    apiKey: accessToken.substring(colonIdx + 1),
  }
}
