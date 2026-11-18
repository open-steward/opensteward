import type { Credentials } from '../../adapter/interface'

// Holded uses API keys generated from the Holded settings panel.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://app.holded.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Holded API keys don't expire — return as-is
  return credentials
}
