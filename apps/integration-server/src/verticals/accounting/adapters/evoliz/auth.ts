import type { Credentials } from '../../adapter/interface'

// Evoliz uses API keys via Authorization Bearer header.
export function buildAuthUrl(_state: string): string {
  return 'https://www.evoliz.io/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API keys don't expire
  return credentials
}
