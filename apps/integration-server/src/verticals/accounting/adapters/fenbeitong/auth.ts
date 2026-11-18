import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(_state: string): string {
  return 'https://open.fenbeitong.com/developer'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is "appKey:appSecret"
  const idx = code.indexOf(':')
  const appKey = idx >= 0 ? code.slice(0, idx) : code
  const appSecret = idx >= 0 ? code.slice(idx + 1) : ''
  return { accessToken: `${appKey}|||${appSecret}` }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
