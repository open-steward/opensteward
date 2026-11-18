import type { Credentials } from '../../adapter/interface'

// Wave uses API tokens generated from the developer portal.
// There is no OAuth2 flow. The "code" is the full-access token itself.

export function buildAuthUrl(_state: string): string {
  return 'https://developer.waveapps.com/hc/en-us/articles/360019762711'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Wave API tokens don't expire — return as-is
  return credentials
}
