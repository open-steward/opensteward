import type { Credentials } from '../../adapter/interface'
import { FASTBILL_SETTINGS_URL } from './constants'

// FastBill uses API keys. The "code" passed during auth exchange is the API key.

export function buildAuthUrl(_state: string): string {
  return FASTBILL_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // FastBill API keys do not expire
  return credentials
}
