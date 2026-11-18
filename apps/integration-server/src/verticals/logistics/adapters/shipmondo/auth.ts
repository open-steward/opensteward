import type { Credentials } from '../../adapter/interface'
import { SHIPMONDO_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return SHIPMONDO_DASHBOARD_URL
}

/**
 * Shipmondo uses HTTP Basic auth. We accept a "username:secret" colon-separated
 * string and store the base64-encoded credential as the access token.
 */
export async function exchangeBasicCredentials(username: string, secret: string): Promise<Credentials> {
  const token = Buffer.from(`${username}:${secret}`).toString('base64')
  return { accessToken: token }
}

export async function exchangeApiKey(code: string): Promise<Credentials> {
  const [username, ...rest] = code.split(':')
  const secret = rest.join(':')
  return exchangeBasicCredentials(username ?? '', secret ?? '')
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
