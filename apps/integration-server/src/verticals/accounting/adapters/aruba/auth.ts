import type { Credentials } from '../../adapter/interface'

// Aruba uses Bearer tokens issued from the Aruba developer portal.
// There is no OAuth2 flow. The "code" is the bearer token itself.

export function buildAuthUrl(_state: string): string {
  return 'https://developer.aruba.it/'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Bearer tokens are long-lived — return as-is
  return credentials
}
