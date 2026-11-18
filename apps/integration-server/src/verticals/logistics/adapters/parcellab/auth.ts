import type { Credentials, CredentialField } from '@opensteward/shared'
import { PARCELLAB_DASHBOARD_URL } from './constants'

/**
 * parcelLab uses HTTP Basic authentication.
 *
 * The Authorization header must be:
 *   Authorization: Basic base64(userId:token)
 *
 * getAuthUrl:         Returns the parcelLab API tokens page (no redirect flow).
 * exchangeCredentials: Stores userId in extra and accessToken as the API token.
 * refreshCredentials:  parcelLab API tokens do not expire; returns credentials
 *                      unchanged.
 */

export function buildAuthUrl(_state: string): string {
  // parcelLab has no OAuth2 flow — direct users to their API token page.
  return PARCELLAB_DASHBOARD_URL
}

export const parcellabCredentialFields: CredentialField[] = [
  {
    name: 'userId',
    label: 'User ID',
    type: 'text',
    required: true,
    helpText: 'Your parcelLab account (user) ID.',
  },
  {
    name: 'apiToken',
    label: 'API Token',
    type: 'password',
    required: true,
    helpText: 'Found in your parcelLab account settings under API tokens.',
  },
]

export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const userId = (fields['userId'] ?? '').trim()
  const apiToken = (fields['apiToken'] ?? '').trim()
  if (!userId) throw new Error('parcelLab User ID is required.')
  if (!apiToken) throw new Error('parcelLab API Token is required.')
  return {
    accessToken: apiToken,
    extra: { userId },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // parcelLab API tokens do not expire.
  return credentials
}

/**
 * Build the Authorization header value for parcelLab requests.
 * Format: "Basic base64(userId:token)"
 */
export function authHeader(credentials: Credentials): string {
  const userId = String(credentials.extra?.['userId'] ?? '')
  const token = credentials.accessToken
  const encoded = Buffer.from(`${userId}:${token}`).toString('base64')
  return `Basic ${encoded}`
}
