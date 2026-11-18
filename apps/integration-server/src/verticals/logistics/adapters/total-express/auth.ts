import type { Credentials } from '../../adapter/interface'
import { TOTAL_EXPRESS_DASHBOARD_URL } from './constants'

/**
 * Total Express uses HTTP Basic Auth.
 *
 * buildAuthUrl:        Returns the Total Express portal where users find their credentials.
 * buildAuthHeader:     Constructs the Authorization: Basic header value from credentials.
 *                      username = credentials.accessToken
 *                      password = credentials.extra?.password ?? ''
 * refreshCredentials:  Basic Auth credentials do not expire; returns as-is.
 */

export function buildAuthUrl(_state: string): string {
  return TOTAL_EXPRESS_DASHBOARD_URL
}

export function buildAuthHeader(credentials: Credentials): string {
  const username = credentials.accessToken
  const password = (credentials.extra?.['password'] as string | undefined) ?? ''
  const encoded = Buffer.from(`${username}:${password}`).toString('base64')
  return `Basic ${encoded}`
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
