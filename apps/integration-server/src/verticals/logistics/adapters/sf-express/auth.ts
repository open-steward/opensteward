import { createHmac } from 'crypto'
import type { Credentials } from '../../adapter/interface'
import { SF_EXPRESS_DASHBOARD_URL } from './constants'

/**
 * SF Express uses HMAC-SHA256 signing for each request.
 * The accessToken stores the checkword (signing key).
 */

export function buildAuthUrl(_state: string): string {
  return SF_EXPRESS_DASHBOARD_URL
}

export async function exchangeApiKey(apiKey: string): Promise<Credentials> {
  // apiKey is the checkword used for HMAC-SHA256 signing
  return { accessToken: apiKey }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/**
 * Generate the HMAC-SHA256 signature for an SF Express request.
 * sign = base64(hmac-sha256(msgData + timestamp + checkword))
 */
export function sign(msgData: string, timestamp: number, checkword: string): string {
  const payload = `${msgData}${timestamp}${checkword}`
  return createHmac('sha256', checkword)
    .update(payload)
    .digest('base64')
}
