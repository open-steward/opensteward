import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(_state: string): string {
  return 'https://open.kingdee.com/developer'
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is "appId:appSecret"
  const idx = code.indexOf(':')
  const appId = idx >= 0 ? code.slice(0, idx) : code
  const appSecret = idx >= 0 ? code.slice(idx + 1) : ''
  return { accessToken: `${appId}|||${appSecret}` }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
