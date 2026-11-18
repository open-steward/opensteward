/**
 * CloudSign auth: a per-connection client ID exchanged for a one-hour token.
 *
 * The Web API spec (https://api.swaggerhub.com/apis/CloudSign/cloudsign-web_api/0.37.0)
 * documents one way in, `POST /token`, whose request body is
 * `application/x-www-form-urlencoded` with a single property, `client_id`,
 * `"required":["client_id"]`. There is no authorize endpoint, no
 * authorization code, no client secret and no refresh token, so this is not
 * OAuth: the customer pastes the client ID they issue at
 * "[管理画面] > [アカウント] > [クライアントID]", and it is kept on the
 * connection so an expired token can be re-minted from it.
 *
 * The client ID is itself the long-lived secret. The usage guide
 * (https://help.cloudsign.jp/ja/articles/2681259): "この文字列が他者に漏れると
 * 成りすましが行われるので、お取り扱いには十分ご注意ください。"
 */
import axios from 'axios'
import { z } from 'zod'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

/**
 * `accessTokenModel`: `access_token` ("アクセストークンの値", 32–36 chars),
 * `expires_in` ("アクセストークンが有効な残り秒数", integer), `token_type`
 * ("Bearer"). Only the first two are read.
 */
const TokenReply = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().nonnegative(),
})

function missingClientId(): Error {
  return Object.assign(new Error("CloudSign needs the connection's client ID to issue a token"), {
    statusCode: 400,
    code: 'MISSING_CREDENTIALS',
  })
}

/**
 * `POST /token` with `client_id`. `expires_in` is the token's REMAINING
 * lifetime, not a fixed hour: the spec says a request made while a token is
 * still valid does not issue a new one ("有効期限内に再度アクセストークンの取得を
 * リクエストしても、新しいアクセストークンは発行されません"), so an early re-mint
 * gets the same token back with fewer seconds left, and the expiry must be
 * computed from the reply rather than assumed.
 */
export async function mintToken(rawClientId: string | undefined): Promise<Credentials> {
  const clientId = rawClientId?.trim()
  if (!clientId) throw missingClientId()
  const { data } = await axios.post<unknown>(
    TOKEN_URL,
    new URLSearchParams({ client_id: clientId }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const reply = TokenReply.parse(data)
  return {
    accessToken: reply.access_token,
    expiresAt: new Date(Date.now() + reply.expires_in * 1000),
    extra: { clientId },
  }
}

/**
 * A refresh failure only this connection can fix by reconnecting.
 * `error: 'invalid_grant'` routes it to the 'expired' status. The client ID is
 * the customer's own, so CloudSign rejecting it is never the operator-wide
 * `invalid_client` case, even though that is the code CloudSign replies with.
 * The upstream error is deliberately not attached as `cause`: its `invalid_client`
 * code would win classification, and its request config carries the client ID.
 */
function grantFailure(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode, error: 'invalid_grant' })
}

/**
 * `POST /token` rejections that mean this connection's client ID is no good,
 * per the spec's responses for that path: 400 "client_id が空の場合、 error の値は
 * invalid_request … 不適切な client_id の場合、 error の値は invalid_client", and
 * 403 "error の値は forbidden … 無効なユーザーのクライアント ID を使用したリクエストの
 * 場合 / IPアドレス制限機能を設定していて、不正なIPアドレスからリクエストした場合".
 * A 500 ("internal_server_error") and network errors stay retryable.
 */
const REJECTED_CLIENT_ID_STATUSES = new Set([400, 403])

/** Re-mint from the client ID stored at connect time. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId']
  if (typeof clientId !== 'string' || !clientId.trim()) {
    throw grantFailure(
      "CloudSign connection holds no client ID to issue a token from; reconnect with the team's client ID",
      400,
    )
  }
  let fresh: Credentials
  try {
    fresh = await mintToken(clientId)
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    if (status !== undefined && REJECTED_CLIENT_ID_STATUSES.has(status)) {
      throw grantFailure(
        status === 403
          ? 'CloudSign refused the client ID (HTTP 403): the client ID belongs to an invalid user, or the team restricts API access by IP address'
          : 'CloudSign rejected the client ID (HTTP 400); reconnect with a valid client ID',
        status,
      )
    }
    throw err
  }
  return { ...credentials, ...fresh, extra: { ...credentials.extra, ...fresh.extra } }
}
