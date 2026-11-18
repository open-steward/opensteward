import type { Credentials } from '../../adapter/interface'

// iCount uses API Key authentication.
// No OAuth2 flow. The "code" is the API key itself.

export function getAuthUrl(_state: string): string {
  return '#'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // iCount API keys do not expire
  return credentials
}
