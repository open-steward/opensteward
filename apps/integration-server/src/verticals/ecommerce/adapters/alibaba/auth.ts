/**
 * Alibaba.com Open Platform signing and seller authorization.
 *
 * Signing, docId=60 ("Signature algorithm") and docId=58 ("Signing API calls"):
 *   1. "Sort all request parameters (including system and application
 *      parameters, but except the “sign” and parameters with byte array type
 *      according to the parameter name in ASCII table."
 *   2. "Concatenate the sorted parameters and their values into a string."
 *   3. "Add the API name in front of the concatenated string."
 *   4. "Encode the concatenated string in UTF-8 format and make a digest by
 *      the signature algorithm (using HMAC_SHA256)."
 *   5. "Convert the digest to hexadecimal format." (the Java sample's
 *      byte2hex upper-cases it)
 * The Java sample skips a key whose value is empty (`isNotEmpty(value)`).
 *
 * System parameters (docId=59, table image): app_key, access_token
 * ("Conditional … mandatory for the APIs that require seller authorization"),
 * timestamp ("in UTC or digital format, like “2017–11–11T12:00:00Z or
 * 1517886554000”"), sign_method and sign.
 *
 * Authorization, docId=56: redirect the seller to
 * https://openapi-auth.alibaba.com/oauth/authorize?response_type=code&
 * redirect_uri=…&client_id=${appkey}, then "Use the /auth/token/create API to
 * get the Access Token", and "Use “/auth/token/refresh” to refresh the access
 * token". Both are ordinary signed REST calls (docId=61 builds
 * https://openapi-api.alibaba.com/rest/auth/token/create?app_key=…&code=…&
 * timestamp=…&sign_method=sha256&…&sign=…); neither takes access_token.
 */

import crypto from 'crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  ALIBABA_REST_BASE,
  AUTH_URL_BASE,
  PATH_TOKEN_CREATE,
  PATH_TOKEN_REFRESH,
  SIGN_METHOD,
} from './constants'

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 signature over `apiPath` + the sorted key/value concatenation,
 * as upper-case hex.
 */
export function buildSign(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string,
): string {
  let raw = apiPath
  for (const key of Object.keys(params).sort()) {
    const value = params[key]
    if (key && value) raw += key + value
  }
  return crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex').toUpperCase()
}

/**
 * Every parameter of one signed call: the system parameters, the API's own
 * parameters (objects serialised as JSON, the way the documented request
 * samples pass them) and the signature.
 */
export function buildSignedParams(
  apiPath: string,
  appKey: string,
  appSecret: string,
  accessToken: string | undefined,
  apiParams: Record<string, string | number | boolean | object | undefined>,
  now: number = Date.now(),
): Record<string, string> {
  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(now),
    sign_method: SIGN_METHOD,
  }
  if (accessToken) params['access_token'] = accessToken
  for (const [k, v] of Object.entries(apiParams)) {
    if (v === undefined) continue
    params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return { ...params, sign: buildSign(apiPath, params, appSecret) }
}

// ── Authorization URL ─────────────────────────────────────────────────────────

/**
 * docId=56 parameter table: client_id ("The appkey of your application"),
 * redirect_uri, response_type ("the only available value is 'code'") and
 * state ("Maintain the state of the application").
 */
export function buildAuthUrl(appKey: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri,
    client_id: appKey,
  })
  if (state) params.set('state', state)
  return `${AUTH_URL_BASE}?${params.toString()}`
}

// ── Token calls ───────────────────────────────────────────────────────────────

/**
 * GenerateAccessToken / RefreshAccessToken response, as documented: every
 * field below appears in both APIs' output parameters, plus the gateway's
 * `code` ("0" in the documented examples) and `message` on failure.
 */
interface AlibabaTokenResponse {
  code?: string
  message?: string
  type?: string
  request_id?: string
  access_token?: string
  refresh_token?: string
  /** "The expiring time of the access token, in seconds" */
  expires_in?: number | string
  /** "The expiring time of th refresh token" */
  refresh_expires_in?: number | string
  account?: string
  account_platform?: string
  user_info?: { seller_id?: string; user_id?: string; loginId?: string; country?: string }
}

async function tokenCall(
  apiPath: string,
  appKey: string,
  appSecret: string,
  apiParams: Record<string, string>,
): Promise<AlibabaTokenResponse & { access_token: string }> {
  const body = buildSignedParams(apiPath, appKey, appSecret, undefined, apiParams)
  const res = await axios.post<AlibabaTokenResponse>(
    `${ALIBABA_REST_BASE}${apiPath}`,
    new URLSearchParams(body).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )
  const data = res.data
  if (String(data.code) !== '0' || !data.access_token) {
    throw new Error(
      `Alibaba ${apiPath} failed: ${data.code ?? 'no code'}${data.message ? ` — ${data.message}` : ''}`,
    )
  }
  return { ...data, access_token: data.access_token }
}

function expiresAtFrom(expiresIn: number | string | undefined): Date | undefined {
  const seconds = Number(expiresIn)
  return expiresIn !== undefined && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000)
    : undefined
}

/**
 * Whether the response says its refresh token cannot be used. docId=56,
 * usage note 2: "If “refresh_expires_in” = 0, the access token cannot be
 * refreshed. Only when “refresh_expires_in” > 0, you can call the
 * /auth/token/refresh API to refresh the access token." Dropping it makes
 * refreshCredentials ask for re-authorization instead of calling refresh.
 */
function cannotRefresh(data: AlibabaTokenResponse): boolean {
  return data.refresh_expires_in !== undefined && Number(data.refresh_expires_in) === 0
}

/** Exchange an authorization code through /auth/token/create. */
export async function exchangeCode(
  code: string,
  appKey: string,
  appSecret: string,
): Promise<Credentials> {
  const data = await tokenCall(PATH_TOKEN_CREATE, appKey, appSecret, { code })
  return {
    accessToken: data.access_token,
    refreshToken: cannotRefresh(data) ? undefined : data.refresh_token,
    expiresAt: expiresAtFrom(data.expires_in),
    extra: {
      appKey,
      appSecret,
      ...(data.user_info?.seller_id ? { sellerId: data.user_info.seller_id } : {}),
      ...(data.account ? { account: data.account } : {}),
    },
  }
}

/** Refresh the access token through /auth/token/refresh. */
export async function refreshCredentials(
  credentials: Credentials,
  fallback: { appKey?: string; appSecret?: string } = {},
): Promise<Credentials> {
  const appKey = (credentials.extra?.['appKey'] as string | undefined) ?? fallback.appKey
  const appSecret = (credentials.extra?.['appSecret'] as string | undefined) ?? fallback.appSecret
  const refreshToken = credentials.refreshToken
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      'Alibaba refreshCredentials needs a refresh token plus appKey and appSecret; ' +
        'one or more are missing. Re-authorize the connection.',
    )
  }
  const data = await tokenCall(PATH_TOKEN_REFRESH, appKey, appSecret, {
    refresh_token: refreshToken,
  })
  return {
    ...credentials,
    accessToken: data.access_token,
    // docId=56: "You will get new “access_token” and “refresh_token”. You must
    // save the latest “refresh_token” for getting the new “access_token”."
    refreshToken: cannotRefresh(data) ? undefined : (data.refresh_token ?? refreshToken),
    expiresAt: expiresAtFrom(data.expires_in),
  }
}
