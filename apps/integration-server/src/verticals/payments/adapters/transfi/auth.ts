import type { Credentials } from '@opensteward/shared'

/**
 * "TransFi uses HTTP Basic Authentication — combine your username and
 * password, Base64-encode the result, and include it in an Authorization
 * header on every request."
 * — https://docs.transfi.com/docs/authenticating-on-the-api.md
 *
 * Every endpoint also takes a `MID` header ("Merchant or sub-merchant MID",
 * required: true on List Orders, Get Order and both List Users references),
 * and the MID changelog makes it mandatory on "All API endpoints"
 * (https://docs.transfi.com/changelog/mandatory-mid-header-requirements.md).
 *
 * The password is the `accessToken`; the username and MID travel in `extra`.
 */
export function buildCredentials(fields: Record<string, string>): Credentials {
  const username = (fields.username ?? '').trim()
  const password = (fields.password ?? '').trim()
  const mid = (fields.mid ?? '').trim()
  if (!username) throw new Error('TransFi API username is required.')
  if (!password) throw new Error('TransFi API password is required.')
  if (!mid) throw new Error('TransFi MID is required.')
  return { accessToken: password, extra: { username, mid } }
}

function extraString(credentials: Credentials, key: string): string | undefined {
  const v = credentials.extra?.[key]
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** The MID every request is sent under, or a 501 before anything is sent. */
export function requireMid(credentials: Credentials): string {
  const mid = extraString(credentials, 'mid')
  if (!mid) {
    throw Object.assign(
      new Error(
        'TransFi requires a MID header on every request ("Merchant or sub-merchant MID", required) and this connection has none: reconnect with the MID from the TransFi dashboard.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
  return mid
}

/** The Basic-auth username, or a 401 before anything is sent. */
export function requireUsername(credentials: Credentials): string {
  const username = extraString(credentials, 'username')
  if (!username || !credentials.accessToken) {
    throw Object.assign(
      new Error(
        'TransFi uses HTTP Basic authentication (username and password) and this connection has no username: reconnect with the API username, password and MID.',
      ),
      { statusCode: 401, code: 'RECONNECT_REQUIRED' },
    )
  }
  return username
}
