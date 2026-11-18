import type { Credentials } from '../../adapter/interface'

// SnelStart uses a subscription key + bearer token.
// There is no OAuth2 redirect flow. The "code" is parsed as
// "subscriptionKey:accessToken" or used directly as the access token.

export function buildAuthUrl(_state: string): string {
  return 'https://my.snelstart.nl/developer'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  if (code.includes(':')) {
    const [subscriptionKey, accessToken] = code.split(':', 2)
    return {
      accessToken,
      extra: { subscriptionKey },
    }
  }
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // SnelStart keys don't expire in the typical sense — return as-is
  return credentials
}
