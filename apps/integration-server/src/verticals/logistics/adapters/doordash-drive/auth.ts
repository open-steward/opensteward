import type { Credentials } from '../../adapter/interface'
import { DOORDASH_DRIVE_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return DOORDASH_DRIVE_DASHBOARD_URL
}

// DoorDash Drive uses HS256 JWTs signed per-request with a shared secret.
// We accept the three required credentials as a colon-delimited string:
//   `<developer_id>:<key_id>:<signing_secret>`
// and stash them in `extra` for the client to sign with at request time.
export async function exchangeCode(code: string, _redirectUri?: string): Promise<Credentials> {
  const parts = code.split(':')
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new Error(
      'DoorDash Drive credentials must be formatted as "<developer_id>:<key_id>:<signing_secret>"',
    )
  }
  const [developerId, keyId, signingSecret] = parts
  return {
    accessToken: '',
    extra: {
      developerId,
      keyId,
      signingSecret,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
