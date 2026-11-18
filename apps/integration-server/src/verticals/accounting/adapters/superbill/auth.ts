import type { Credentials } from '../../adapter/interface'

// Superbill (part of DATEV.it) uses OAuth 2.0 with Authorization-Key.
// Developer portal: developer.datev.it
// Configuration API base: configapi.datev.it (formerly superbillapi.datev.it)

export function buildAuthUrl(_state: string): string {
  return 'https://developer.datev.it/'
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
