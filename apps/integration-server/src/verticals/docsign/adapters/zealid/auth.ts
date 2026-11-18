/**
 * ZealiD Data API ("Orpheus") OAuth + HMAC auth helpers.
 *
 * The user grant is obtained with a standard OAuth2 authorization-code
 * flow (RFC 6749): the user scans the ZealiD authentication QR code and
 * ZealiD redirects to `redirect_uri` with a `?code=...`. The integrator
 * then exchanges that code at `/get_token` for a per-user `access_token`,
 * and calls `/get_data` to learn the `customer_id` that every
 * document-scoped request is keyed by.
 *
 * Every Data API request — including `/get_token` and `/get_data` — is
 * additionally signed per-request with an HMAC-SHA512 `Authorization: HMAC`
 * header derived from the integrator's `client_id` / `client_secret`. The
 * signing recipe lives in `signHmacAuthorization` and is reused by the
 * client.
 *
 * Docs: https://developer.zealid.com/docs/data-api-in-detail
 *       https://developer.zealid.com/docs/about-hmac-authentication
 */
import { createHmac, randomBytes } from 'node:crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, AUTH_LINK_BASE_URL, OAUTH_TOKEN_PATH } from './constants'

/** Path prefix on the host that the HMAC `request_string` must include. */
const MEDIATOR_PATH_PREFIX = '/mediator/api/orpheus/v2.0/api'

/**
 * Build the `Authorization: HMAC ...` header value for a single request.
 *
 * Recipe (per ZealiD docs):
 *   signature  = BASE64(HMAC-SHA512(client_secret, auth_string))
 *   auth_string = client_id + nonce + ts + request_string + payload
 *   request_string = "<METHOD> <full_path>"   e.g. "GET /mediator/api/get_token"
 *   payload        = request body for POST; "" otherwise
 *
 * header = HMAC client_id="..",ts="..",nonce="..",signature=".."
 */
export function signHmacAuthorization(args: {
  clientId: string
  clientSecret: string
  method: string
  path: string
  payload?: string
}): string {
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(32).toString('hex')
  const fullPath = `${MEDIATOR_PATH_PREFIX}${args.path.startsWith('/') ? '' : '/'}${args.path}`
  const requestString = `${args.method.toUpperCase()} ${fullPath}`
  const authString = `${args.clientId}${nonce}${ts}${requestString}${args.payload ?? ''}`
  const signature = createHmac('sha512', args.clientSecret).update(authString).digest('base64')
  return `HMAC client_id="${args.clientId}",ts="${ts}",nonce="${nonce}",signature="${signature}"`
}

/**
 * Build the ZealiD auth-link start URL.
 *
 * ZealiD does NOT expose an OAuth2 /authorize page. Instead the user grant
 * is initiated by directing the user to a QR-scan page at:
 *
 *   <AUTH_LINK_BASE_URL>/<client_id>
 *
 * The client_id is a PATH segment. After the user scans and approves, ZealiD
 * redirects to the `redirectUri` with a `?code=HERMES_CODE` query parameter
 * that is exchanged at `/get_token`.
 *
 * The `redirectUri`, `scopes`, and `state` parameters are accepted here for
 * interface compatibility with the DocsignAdapter contract, but ZealiD does
 * not accept them as query parameters on the auth-link URL.
 */
export function buildAuthUrl(
  clientId: string,
  _redirectUri: string,
  _scopes: string[],
  _state: string,
): string {
  return `${AUTH_LINK_BASE_URL}/${encodeURIComponent(clientId)}`
}

interface ZealidTokenResponse {
  access_token: string
  status?: string
}

interface ZealidDataResponse {
  customer_id?: string
  first_name?: string
  last_name?: string
  email?: string
  serial_number?: string
  [key: string]: unknown
}

async function postSigned<T>(
  path: string,
  body: Record<string, unknown>,
  clientId: string,
  clientSecret: string,
): Promise<T> {
  const payload = JSON.stringify(body)
  const authorization = signHmacAuthorization({
    clientId,
    clientSecret,
    method: 'POST',
    path,
    payload,
  })
  const { data } = await axios.post<T>(`${API_BASE_URL}${path}`, payload, {
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
  return data
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const token = await postSigned<ZealidTokenResponse>(
    OAUTH_TOKEN_PATH,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri },
    clientId,
    clientSecret,
  )

  // Resolve the customer_id keying every document-scoped request.
  let customerId: string | undefined
  try {
    const profile = await postSigned<ZealidDataResponse>(
      '/get_data',
      { access_token: token.access_token },
      clientId,
      clientSecret,
    )
    customerId = profile.customer_id
  } catch {
    // get_data is best-effort here; the customer_id can also be supplied
    // by the caller as the document list's envelope_id.
  }

  return {
    accessToken: token.access_token,
    extra: {
      customerId: customerId ?? '',
      clientId,
      clientSecret,
    },
  }
}

/**
 * The Data API user grant does not document a refresh token; the
 * `access_token` is re-obtained by re-running the authorization-code flow.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
