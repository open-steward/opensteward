import type { Credentials } from '../../adapter/interface'
import { GIDDH_APP_URL } from './constants'

// Giddh uses auth keys (header-based). There is no OAuth2 flow.
// The "code" is the auth key itself.

export function buildAuthUrl(_state: string): string {
  return GIDDH_APP_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Giddh auth keys don't expire — return as-is
  return credentials
}
