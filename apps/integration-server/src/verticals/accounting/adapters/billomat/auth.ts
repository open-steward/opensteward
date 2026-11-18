import type { Credentials } from '../../adapter/interface'

// Billomat uses API keys generated from the Billomat settings UI.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://www.billomat.com/api/basics/'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Billomat API keys don't expire — return as-is
  return credentials
}
