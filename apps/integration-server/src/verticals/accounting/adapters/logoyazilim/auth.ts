import type { Credentials } from '../../adapter/interface'

// Logo Yazılım uses a static Bearer Token (API key).
// There is no OAuth2 flow. The "code" is the API key itself.

export function getAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Static API keys don't expire — return as-is
  return credentials
}
