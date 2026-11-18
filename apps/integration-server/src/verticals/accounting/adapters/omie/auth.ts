import type { Credentials } from '../../adapter/interface'

// Omie uses app_key and app_secret passed in every request body.
// The "code" during exchange is "app_key:app_secret".

export function buildAuthUrl(_state: string): string {
  return 'https://developer.omie.com.br'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code format: "app_key:app_secret"
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
