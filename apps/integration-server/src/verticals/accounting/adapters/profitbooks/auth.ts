import type { Credentials } from '../../adapter/interface'

// ProfitBooks uses API keys generated from the developer portal.
// There is no OAuth2 flow. The "code" is the API key itself.

export function buildAuthUrl(_state: string): string {
  return 'https://www.profitbooks.net/developers/api-key'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return {
    accessToken: code,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // ProfitBooks API keys don't expire — return as-is
  return credentials
}
