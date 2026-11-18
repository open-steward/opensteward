import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(_state: string): string {
  return 'https://app.cloudmesoft.com/settings/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
