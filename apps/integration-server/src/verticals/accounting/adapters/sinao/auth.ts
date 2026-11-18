import type { Credentials } from '../../adapter/interface'

// Sinao uses API keys. The "code" is the API key itself.
export function buildAuthUrl(_state: string): string {
  return 'https://app.sinao.app/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Sinao API keys don't expire — return as-is
  return credentials
}
