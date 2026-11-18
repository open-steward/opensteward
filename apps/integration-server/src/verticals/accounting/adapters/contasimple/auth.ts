import type { Credentials } from '../../adapter/interface'

// Contasimple uses API key authentication via Bearer token.
// The API key is obtained from the Contasimple account settings.

export function buildAuthUrl(_state: string): string {
  return 'https://app.contasimple.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Contasimple API keys don't expire — return as-is
  return credentials
}
