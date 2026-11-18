import type { Credentials } from '../../adapter/interface'

// SimplBooks uses a static API key issued from the company settings panel
// (Premium plan only). There is no OAuth2 flow.

export function buildAuthUrl(_state: string): string {
  return 'https://app.simplbooks.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // `code` is the API key entered by the user in the Connect Link form
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys do not expire — return as-is
  return credentials
}
