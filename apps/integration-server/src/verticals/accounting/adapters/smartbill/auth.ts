import type { Credentials } from '../../adapter/interface'
import { SMARTBILL_SETTINGS_URL } from './constants'

// SmartBill uses HTTP Basic Authentication:
//   - username = account email
//   - password = API token from account settings
// The "code" passed in exchangeCode is expected to be "email:apitoken" (colon-separated).

export function buildAuthUrl(_state: string): string {
  // Direct user to the SmartBill account settings page to obtain their API token
  return SMARTBILL_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // code is "email:apitoken" provided by the user
  const idx = code.indexOf(':')
  const email = idx !== -1 ? code.slice(0, idx) : code
  const apiToken = idx !== -1 ? code.slice(idx + 1) : ''
  // Store email in accessToken field and apiToken in extra for Basic Auth construction
  return { accessToken: email, extra: { apiToken } }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // API token does not expire; simply return credentials unchanged
  return credentials
}
