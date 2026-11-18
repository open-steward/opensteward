/**
 * Global Payments GP-API authentication.
 *
 * GP-API has no authorization-code flow. The only documented way to get a
 * token is `POST /ucp/accesstoken` with the app's own credentials
 * (https://developer.globalpayments.com/api/access-token, operationId
 * getAccessToken). Its required body fields are `app_id`, `nonce`, `secret`
 * and `grant_type`:
 *
 * - nonce: "A unique random value used to create the secret. The integrator
 *   must ensure this is unique and different for every request to create an
 *   access token."
 * - secret: "A unique string created using the nonce and app-key. This value
 *   is used to further authenticate the request. Created as follows -
 *   SHA512(NONCEAPP-KEY". The documented example is 128 lowercase hex digits,
 *   i.e. a hex-encoded SHA-512 digest.
 * - grant_type: "This is an Oauth specific field that must be set to
 *   client_credentials."
 *
 * The response carries `token` ("The access token that can be used to
 * execute API actions."), `type` (`Bearer`) and `seconds_to_expire` ("The time
 * in seconds that the access token will expire and can no longer be used.").
 *
 * The app id and app key are stored on `credentials.extra` so the client can
 * mint a new token when the current one expires.
 */
import { createHash, randomUUID } from 'node:crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { ACCESS_TOKEN_PATH, API_BASE_URL, GP_API_VERSION } from './constants'

export interface GlobalPaymentsExtra {
  appId: string
  appKey: string
  /**
   * The settlement-reporting account name that GET /settlement/deposits
   * requires as `account_name`. Not part of the documented auth, so the
   * Connect form does not ask for it; kept when a caller submits it.
   */
  accountName?: string
}

interface AccessTokenResponse {
  token: string
  type?: string
  seconds_to_expire?: number
}

export function readExtra(credentials: Credentials): GlobalPaymentsExtra {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const accountName = typeof extra.accountName === 'string' ? extra.accountName.trim() : ''
  return {
    appId: typeof extra.appId === 'string' ? extra.appId : '',
    appKey: typeof extra.appKey === 'string' ? extra.appKey : '',
    ...(accountName ? { accountName } : {}),
  }
}

/** `SHA512(nonce + app key)`, hex-encoded, as the access-token docs describe. */
export function accessTokenSecret(nonce: string, appKey: string): string {
  return createHash('sha512')
    .update(nonce + appKey)
    .digest('hex')
}

export async function mintToken(extra: GlobalPaymentsExtra): Promise<Credentials> {
  if (!extra.appId || !extra.appKey) {
    throw new Error('Global Payments needs an app id and app key to create an access token.')
  }
  const nonce = randomUUID()
  const { data } = await axios.post<AccessTokenResponse>(
    `${API_BASE_URL}${ACCESS_TOKEN_PATH}`,
    {
      app_id: extra.appId,
      nonce,
      secret: accessTokenSecret(nonce, extra.appKey),
      grant_type: 'client_credentials',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-GP-Version': GP_API_VERSION,
      },
      timeout: 30_000,
    },
  )
  if (typeof data?.token !== 'string' || data.token === '') {
    throw new Error('Global Payments access-token response carried no token.')
  }
  return {
    accessToken: data.token,
    ...(typeof data.seconds_to_expire === 'number'
      ? { expiresAt: new Date(Date.now() + data.seconds_to_expire * 1000) }
      : {}),
    extra: { ...extra },
  }
}

/** Connect-form exchange: validate the app credentials by minting a first token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const appId = (fields.appId ?? '').trim()
  const appKey = (fields.appKey ?? '').trim()
  if (!appId || !appKey) throw new Error('App ID and App Key are required.')
  const accountName = (fields.accountName ?? '').trim()
  return mintToken({ appId, appKey, ...(accountName ? { accountName } : {}) })
}
