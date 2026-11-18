import type { Credentials } from '../../adapter/interface'

// Billy uses long-lived access tokens generated from the Billy UI.
// There is no OAuth2 flow. The "code" is the access token itself.

export function buildAuthUrl(_state: string): string {
  return 'https://app.billysbilling.com/settings/access-tokens'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Billy tokens don't expire — return as-is
  return credentials
}
