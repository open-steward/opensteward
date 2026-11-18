import type { Credentials } from '../../adapter/interface'
import { POCHTA_RUSSIA_DASHBOARD_URL } from './constants'

/**
 * Pochta Rossii uses two-part "basic" authentication:
 *  1. Authorization: AccessToken <app_token>   — per-application token from the portal
 *  2. X-User-Authorization: Basic <base64(login:password)> — per-user credential
 *
 * We store both parts in the credential object:
 *   accessToken  — the application token
 *   refreshToken — the base64-encoded "login:password" user key
 *
 * getAuthUrl:          Redirects users to the Otpravka portal to obtain credentials.
 * exchangeCode:        Expects a JSON string "{"token":"…","userKey":"…"}" as the code.
 * refreshCredentials:  Credentials never expire; returns them unchanged.
 */

export interface PochtaRussiaCredentialParts {
  token: string
  userKey: string
}

export function buildAuthUrl(_state: string): string {
  return POCHTA_RUSSIA_DASHBOARD_URL
}

export function parseCredentialCode(code: string): PochtaRussiaCredentialParts {
  try {
    const parsed = JSON.parse(code) as Record<string, unknown>
    return {
      token: String(parsed['token'] ?? ''),
      userKey: String(parsed['userKey'] ?? ''),
    }
  } catch {
    // Treat as raw token if JSON parsing fails
    return { token: code, userKey: '' }
  }
}

export async function exchangeCredentials(code: string): Promise<Credentials> {
  const { token, userKey } = parseCredentialCode(code)
  return {
    accessToken: token,
    refreshToken: userKey,
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Pochta Rossii credentials do not expire.
  return credentials
}

/**
 * Build the two Authorization header values for Pochta Rossii requests.
 */
export function authHeaders(credentials: Credentials): Record<string, string> {
  return {
    // Application-level token
    Authorization: `AccessToken ${credentials.accessToken}`,
    // User-level Base64 key (stored in refreshToken field)
    'X-User-Authorization': credentials.refreshToken
      ? `Basic ${credentials.refreshToken}`
      : '',
  }
}
