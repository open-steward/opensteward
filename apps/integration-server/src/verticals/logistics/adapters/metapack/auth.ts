/**
 * Metapack authentication: HTTP Basic, not OAuth.
 *
 * Shipping API spec, securitySchemes.BasicAuth
 * (https://dev.metapack.com/shipping/reference/shipping/operation/getAccountCarriers/):
 *   "The `Authorization` header comprises the prefix `Basic` followed by a
 *   Base64-encoded `<username>:<password>` string."
 * The Tracking API documents the same scheme. Quick start
 * (https://dev.metapack.com/shipping/get-started/shipping-api-quick-start/):
 *   "An API key is sent by encrypted email ... The messsage includes your
 *   username, password, key, and secret."
 *
 * The username is stored in credentials.extra.username and the password as
 * credentials.accessToken. There is no token to refresh.
 */
import type { Credentials } from '../../adapter/interface'
import { METAPACK_DASHBOARD_URL } from './constants'

export function buildAuthUrl(_state: string): string {
  return METAPACK_DASHBOARD_URL
}

export async function exchangeBasicCredentials(
  username: string,
  password: string,
): Promise<Credentials> {
  if (!username) throw new Error('Metapack API username is required.')
  if (!password) throw new Error('Metapack API password is required.')
  return { accessToken: password, extra: { username } }
}

/** A "username:password" string, the password taking everything after the first colon. */
export async function exchangeApiKey(code: string): Promise<Credentials> {
  const [username, ...rest] = code.split(':')
  return exchangeBasicCredentials((username ?? '').trim(), rest.join(':'))
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}

/** The Basic-auth username. A connection without one cannot authenticate. */
export function metapackUsername(credentials: Credentials): string {
  const username = credentials.extra?.['username']
  if (typeof username !== 'string' || username === '') {
    throw new Error('Metapack credentials lack the API username (extra.username); reconnect.')
  }
  return username
}

export function authHeader(credentials: Credentials): string {
  const basic = Buffer.from(`${metapackUsername(credentials)}:${credentials.accessToken}`).toString(
    'base64',
  )
  return `Basic ${basic}`
}
