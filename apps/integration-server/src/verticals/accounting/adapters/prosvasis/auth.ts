import type { Credentials } from '../../adapter/interface'

// Prosvasis uses API key authentication — no OAuth2 flow.
// The API key is stored as the accessToken.

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
