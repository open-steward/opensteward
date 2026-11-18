import type { Credentials } from '../../adapter/interface'
import { MERITAKTIVA_SETTINGS_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return MERITAKTIVA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  const idx = code.indexOf(':')
  const apiKey = idx !== -1 ? code.slice(0, idx) : code
  const apiSecret = idx !== -1 ? code.slice(idx + 1) : ''
  return { accessToken: apiKey, extra: { apiSecret } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
