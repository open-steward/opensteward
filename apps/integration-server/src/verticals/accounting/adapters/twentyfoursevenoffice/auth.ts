import type { Credentials } from '../../adapter/interface'

// 24SevenOffice uses session-based auth with AppID.
// The "code" is the session token / API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://app.24sevenoffice.com/settings/api-keys'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Session tokens don't expire via OAuth — return as-is
  return credentials
}
