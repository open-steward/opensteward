import type { Credentials } from '../../adapter/interface'
import { ZIM_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return ZIM_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
