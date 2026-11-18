import axios from 'axios'
import { z } from 'zod'
import type { Credentials } from '../../adapter/interface'
import {
  ENDICIA_AUTHORIZE_PATH,
  ENDICIA_OFFLINE_ACCESS_SCOPE,
  ENDICIA_SANDBOX_SIGNIN_BASE,
  ENDICIA_SIGNIN_BASE,
  ENDICIA_TOKEN_PATH,
} from './constants'

/**
 * SERA OAuth2 authorization-code flow, per
 * https://developer.stamps.com/rest-api/reference/serav1.html (Authentication):
 *
 *   "1. Login: Application presents the server-hosted login page to the user
 *       in a browser.
 *    2. Redirect with Authorization Code ...
 *    3. Initial Token Generation: Application uses authorization code to
 *       generate the initial set of access and refresh tokens.
 *    4. Refresh Token: Application uses the stored refresh token to generate a
 *       new access token as needed."
 *
 * The client ID and secret are the operator's app registration ("the
 * `redirect_uri` value specific to an application must be provided in advance
 * in order to setup a valid Client ID"), so they come from adapter config, not
 * from the connection.
 */

export interface EndiciaOAuthClient {
  clientId: string
  clientSecret: string
  sandbox: boolean
}

export function signinBase(sandbox: boolean): string {
  return sandbox ? ENDICIA_SANDBOX_SIGNIN_BASE : ENDICIA_SIGNIN_BASE
}

/**
 * GET /authorize. Documented query parameters: `client_id`, `response_type`
 * ("Set to `code` for the authorization code flow"), `redirect_uri` ("The
 * login page will redirect to this URI on successful login") and `scope`
 * ("Specify this `scope` value as `offline_access` in order to receive a
 * `refresh_token` in the response").
 *
 * `state` is not among the documented parameters. It is the RFC 6749 §4.1.1
 * CSRF parameter the control plane's callback keys pending connections on, so
 * it is sent; the flow cannot complete through that callback without it.
 */
export function buildAuthUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
  sandbox: boolean
  /** A Connect Link scope override replaces the default offline_access. */
  scopes?: string[]
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scopes?.length ? opts.scopes.join(' ') : ENDICIA_OFFLINE_ACCESS_SCOPE,
    state: opts.state,
  })
  return `${signinBase(opts.sandbox)}${ENDICIA_AUTHORIZE_PATH}?${params.toString()}`
}

/**
 * POST /oauth/token 200 body: `access_token` ("Used to authenticate for SERA
 * calls"), `refresh_token` ("This can be used to generate a new access token
 * as needed"), `id_token`, `token_type` ("Returned as \"Bearer\"") and
 * `expires_in` ("Access token expires in these many seconds", typed string —
 * coerced to a number here).
 */
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  expires_in: z.coerce.number().positive().optional(),
})

type TokenResponse = z.infer<typeof TokenResponseSchema>

/** The token endpoint's request body is documented as `application/json`. */
async function postToken(sandbox: boolean, body: Record<string, string>): Promise<TokenResponse> {
  const { data } = await axios.post<unknown>(`${signinBase(sandbox)}${ENDICIA_TOKEN_PATH}`, body, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  return TokenResponseSchema.parse(data)
}

function expiresAt(expiresIn: number | undefined): Date | undefined {
  return expiresIn === undefined ? undefined : new Date(Date.now() + expiresIn * 1000)
}

/**
 * Initial token generation: `grant_type` "Must set to `authorization_code` for
 * this request", with `client_id`, `client_secret`, `code` and `redirect_uri`
 * ("Must match the `redirect_uri` value used in the /authorize call").
 */
export async function exchangeCode(
  client: EndiciaOAuthClient,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const token = await postToken(client.sandbox, {
    grant_type: 'authorization_code',
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    redirect_uri: redirectUri,
  })
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: expiresAt(token.expires_in),
  }
}

/**
 * Refresh: `grant_type` "Must set to `refresh_token` for this request", with
 * `client_id`, `client_secret` and `refresh_token`.
 *
 * "Once an `access_token` has expired or is near-expiration, the integration
 * should used the stored `refresh_token` to call for a new `access_token`" —
 * and "the `refresh_token` is stored for long-term access", so when a refresh
 * response carries no new refresh token the stored one is kept.
 */
export async function refreshCredentials(
  client: EndiciaOAuthClient,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error(
      'endicia: this connection has no refresh token; reconnect it (the authorize URL requests offline_access)',
    )
  }
  const token = await postToken(client.sandbox, {
    grant_type: 'refresh_token',
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: credentials.refreshToken,
  })
  return {
    ...credentials,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? credentials.refreshToken,
    expiresAt: expiresAt(token.expires_in),
  }
}

/**
 * "The application can begin calling SERA using the `access_token` value in
 * the Authorization header preceded by the word `Bearer`".
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
