import type { Credentials } from '../../adapter/interface'

// Danea Easyfatt is a local desktop application exposing a local API.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'http://localhost:9000/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Local API keys don't expire — return as-is
  return credentials
}
