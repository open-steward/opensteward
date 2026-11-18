import type { Credentials } from '../../adapter/interface'
import { PUROLATOR_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return PUROLATOR_DASHBOARD_URL
}

/**
 * Purolator uses HTTP Basic auth (developer key + developer password).
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
