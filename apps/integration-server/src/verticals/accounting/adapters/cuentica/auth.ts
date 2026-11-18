import type { Credentials } from '../../adapter/interface'

// Cuentica uses API key authentication via Token header.
// The API key is obtained from Cuentica account settings.

export function buildAuthUrl(_state: string): string {
  return 'https://app.cuentica.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Cuentica API keys don't expire — return as-is
  return credentials
}
