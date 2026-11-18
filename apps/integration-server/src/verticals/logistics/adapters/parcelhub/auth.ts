/**
 * Parcelhub Shipping API authentication.
 *
 * https://api.parcelhub.net/docs/shippingAPI/get-bearer-token/ (POST /1.0/TokenV2):
 *
 *   "To use the shipping API, you must send a JWT bearer token as a header in
 *    every request. To get this token, you need to call the TokenV2 endpoint
 *    with your username and password"
 *
 *   "The Refresh Token can be used to generate a new access token. This token
 *    will expire if it isnt used for 30 days."
 *
 *   "Then add the header `Authorization: bearer tokengoeshere` to the HTTP
 *    headers of your request"
 *
 * Request body (RequestToken): `grant_type` ("Should be set to \"bearer\" or
 * \"refreshtoken\""), `username`, `password`. The refresh example sends the
 * refresh token as `username` and an empty `password`. Response (TokenV2):
 * `refreshToken`, `access_token`, `expiresIn`.
 */
import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import {
  PARCELHUB_ACCESS_TOKEN_TTL_MS,
  PARCELHUB_DASHBOARD_URL,
  PARCELHUB_TOKEN_URL,
} from './constants'
import { escapeXml, parseXml, textOf } from './xml'

export function buildAuthUrl(_state: string): string {
  return PARCELHUB_DASHBOARD_URL
}

async function requestToken(
  grantType: 'bearer' | 'refreshtoken',
  username: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string | undefined }> {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<RequestToken xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<grant_type>${grantType}</grant_type>` +
    `<username>${escapeXml(username)}</username>` +
    `<password>${escapeXml(password)}</password>` +
    '</RequestToken>'
  const { data } = await axios.post<string>(PARCELHUB_TOKEN_URL, body, {
    headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' },
    responseType: 'text',
  })
  const token = parseXml(String(data))
  const accessToken = textOf(token, 'access_token')
  if (!accessToken) throw new Error('Parcelhub TokenV2 response carried no access_token')
  return { accessToken, refreshToken: textOf(token, 'refreshToken') }
}

export interface ParcelHubLogin {
  username: string
  password: string
  /** Tracking API credentials, stored for getTrackingEvents. Optional. */
  trackingAccountId?: string
  trackingAccessCode?: string
}

function trackingExtra(login: {
  trackingAccountId?: string
  trackingAccessCode?: string
}): Record<string, unknown> | undefined {
  if (!login.trackingAccountId || !login.trackingAccessCode) return undefined
  return {
    trackingAccountId: login.trackingAccountId,
    trackingAccessCode: login.trackingAccessCode,
  }
}

/** Trade the Shipping API username and password for a bearer token. */
export async function exchangePassword(login: ParcelHubLogin): Promise<Credentials> {
  const { accessToken, refreshToken } = await requestToken('bearer', login.username, login.password)
  const extra = trackingExtra(login)
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    expiresAt: new Date(Date.now() + PARCELHUB_ACCESS_TOKEN_TTL_MS),
    ...(extra ? { extra } : {}),
  }
}

/** Mint a new access token from the stored refresh token. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const current = credentials.refreshToken
  if (!current) {
    throw new Error(
      'Cannot refresh Parcelhub credentials: the connection has no refresh token. Reconnect it with the Shipping API username and password.',
    )
  }
  const { accessToken, refreshToken } = await requestToken('refreshtoken', current, '')
  return {
    ...credentials,
    accessToken,
    refreshToken: refreshToken ?? current,
    expiresAt: new Date(Date.now() + PARCELHUB_ACCESS_TOKEN_TTL_MS),
  }
}

export function authHeader(accessToken: string): string {
  return `bearer ${accessToken}`
}
