import type { Credentials } from '../../adapter/interface'

// Axonaut uses API keys via apikey header.
export function buildAuthUrl(_state: string): string {
  return 'https://axonaut.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys don't expire
  return credentials
}
