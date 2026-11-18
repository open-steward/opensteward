import type { Credentials } from '../../adapter/interface'

// Luca Regnskap uses API keys generated from the Luca settings panel.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://app.lucaregnskap.no/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Luca API keys don't expire — return as-is
  return credentials
}
