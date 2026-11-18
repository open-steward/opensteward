import type { Credentials } from '../../adapter/interface'
import { CANADA_POST_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return CANADA_POST_DASHBOARD_URL
}

/**
 * Canada Post uses HTTP Basic auth with a username (API key) and password (API secret).
 * We accept a `username:password` colon-separated string and base64-encode it.
 */
export async function exchangeBasicCredentials(username: string, password: string): Promise<Credentials> {
  const token = Buffer.from(`${username}:${password}`).toString('base64')
  return { accessToken: token }
}

export async function exchangeApiKey(code: string): Promise<Credentials> {
  const [username, ...rest] = code.split(':')
  const password = rest.join(':')
  return exchangeBasicCredentials(username ?? '', password ?? '')
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
