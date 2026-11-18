import type { Credentials } from '../../adapter/interface'

// iPaidThat uses API keys via X-API-Key header.
export function buildAuthUrl(_state: string): string {
  return 'https://app.ipaidthat.io/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys don't expire
  return credentials
}
