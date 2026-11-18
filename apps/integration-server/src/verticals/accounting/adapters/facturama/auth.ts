import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(_state: string): string {
  return 'https://www.facturama.mx/api'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is expected to be base64-encoded username:password
  return { accessToken: code }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
