import type { Credentials } from '../../adapter/interface'

// Finly uses API keys. There is no OAuth2 flow.
// The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://www.finly.io/developers/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Finly API keys don't expire — return as-is
  return credentials
}
