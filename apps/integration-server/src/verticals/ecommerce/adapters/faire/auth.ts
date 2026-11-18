/**
 * Faire OAuth2 helpers (Authorization Code Grant), per the "OAuth" section of
 * https://developers.faire.com/docs.
 *
 * Authorize: `https://faire.com/oauth2/authorize?applicationId=…&scope=…&state=…&redirectUrl=…`
 * ("Query String Parameters": `applicationId` string, `scope` string[],
 * `state` string, `redirectUrl` string — all required).
 *
 * Token: `POST https://www.faire.com/api/external-api-oauth2/token` with the
 * docs' sample request body:
 *   { "application_token", "application_secret", "redirect_url", "scope": [...],
 *     "grant_type": "AUTHORIZATION_CODE", "authorization_code" }
 * Sample response: { "access_token": "OAUTH_ACCESS_TOKEN", "token_type": "BEARER" }.
 *
 * The docs describe no refresh grant and no expiry: the response carries
 * neither `refresh_token` nor `expires_in`.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  applicationId: string,
  redirectUrl: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({ applicationId })
  // `scope` is documented as `string[]`; each permission is its own value.
  for (const scope of scopes) params.append('scope', scope)
  params.append('state', state)
  params.append('redirectUrl', redirectUrl)
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface FaireTokenResponse {
  access_token?: string
  token_type?: string
}

export async function exchangeCode(
  code: string,
  applicationId: string,
  applicationSecret: string,
  redirectUrl: string,
  scopes: string[],
): Promise<Credentials> {
  const { data } = await axios.post<FaireTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      application_token: applicationId,
      application_secret: applicationSecret,
      redirect_url: redirectUrl,
      // "This list must match the previously provided scope parameter".
      scope: scopes,
      grant_type: 'AUTHORIZATION_CODE',
      authorization_code: code,
    },
    { headers: { 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  if (!data.access_token) {
    throw new Error('Faire token exchange returned no access_token')
  }
  return { accessToken: data.access_token }
}
