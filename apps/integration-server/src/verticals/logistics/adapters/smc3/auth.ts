import type { Credentials } from '../../adapter/interface'
import { SMC3_DASHBOARD_URL, CREDENTIAL_SEPARATOR } from './constants'

/**
 * SMC3 uses three header-based credentials per request:
 *   licenseKey, username, password
 *
 * We encode them as a pipe-delimited string in `accessToken`:
 *   "<username>|<password>|<licenseKey>"
 *
 * The adapter's credential form collects all three fields separately,
 * then packs them into the token string.
 */

export function buildAuthUrl(_state: string): string {
  return SMC3_DASHBOARD_URL
}

export async function exchangeCredentials(
  username: string,
  password: string,
  licenseKey: string,
): Promise<Credentials> {
  const accessToken = [username, password, licenseKey].join(CREDENTIAL_SEPARATOR)
  return { accessToken }
}

export function parseCredentials(accessToken: string): {
  username: string
  password: string
  licenseKey: string
} {
  const parts = accessToken.split(CREDENTIAL_SEPARATOR)
  return {
    username: parts[0] ?? '',
    password: parts[1] ?? '',
    licenseKey: parts[2] ?? '',
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // SMC3 license-key credentials do not expire.
  return credentials
}
