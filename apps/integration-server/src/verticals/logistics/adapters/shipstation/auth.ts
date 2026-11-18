import type { Credentials } from '../../adapter/interface'
import { SHIPSTATION_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return SHIPSTATION_DASHBOARD_URL
}

export async function exchangeApiKey(apiKeyAndSecret: string): Promise<Credentials> {
  // ShipStation uses api_key:api_secret as Basic auth.
  // The "code" is expected to be "api_key:api_secret" which we base64-encode.
  const encoded = Buffer.from(apiKeyAndSecret).toString('base64')
  return {
    accessToken: encoded,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function authHeader(encodedToken: string): string {
  return `Basic ${encodedToken}`
}
