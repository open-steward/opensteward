import type { Credentials } from '../../adapter/interface'

// Mekari Jurnal uses API key authentication.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys don't expire — return as-is
  return credentials
}
