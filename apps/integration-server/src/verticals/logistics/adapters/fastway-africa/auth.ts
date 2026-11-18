import type { Credentials } from '../../adapter/interface'
import { FASTWAY_AFRICA_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return FASTWAY_AFRICA_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

export function authHeader(apiKey: string): string {
  return `Bearer ${apiKey}`
}
