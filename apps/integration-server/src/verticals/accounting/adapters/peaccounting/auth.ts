import type { Credentials } from '../../adapter/interface'

// PE Accounting (now rebranded to Kleer) uses API tokens.
// There is no OAuth2 flow. The token is obtained from the PE Accounting settings.

export function buildAuthUrl(_state: string): string {
  return 'https://my.accounting.pe/login'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // PE Accounting API keys don't expire — return as-is
  return credentials
}
