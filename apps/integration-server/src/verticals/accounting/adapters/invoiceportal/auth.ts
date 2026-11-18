import type { Credentials } from '../../adapter/interface'
import { INVOICEPORTAL_SETTINGS_URL } from './constants'

// Invoice-Portal uses Bearer tokens. The "code" passed during auth exchange is the token.

export function buildAuthUrl(_state: string): string {
  return INVOICEPORTAL_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Tokens do not expire unless rotated manually
  return credentials
}
