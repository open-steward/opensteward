import type { Credentials } from '../../adapter/interface'
import { FATOURA_SETTINGS_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return FATOURA_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
