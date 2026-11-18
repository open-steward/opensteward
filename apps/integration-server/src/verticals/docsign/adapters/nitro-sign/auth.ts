/**
 * Nitro Sign authentication — the OAuth 2.0 client-credentials grant.
 *
 * "The Nitro APIs use machine-to-machine OAuth with the client credentials
 * grant type to generate access tokens for authenticating API requests." The
 * customer creates the application in their own Nitro Admin Portal, so the
 * Client ID / Client Secret pair belongs to the connection, not the
 * deployment. (https://developers.gonitro.com/docs/authentication/credentials.md)
 *
 * Token request, verbatim from
 * https://developers.gonitro.com/docs/authentication/token-renew.md:
 *
 *   curl -X POST https://api.gonitro.dev/oauth/token \
 *     -H "Content-Type: application/json" \
 *     -d '{ "clientID": "<nitro_app_id>", "clientSecret": "<your_app_secret>" }'
 *
 * answered by `{ "accessToken": …, "tokenType": "Bearer", "expiresIn": 86400 }`.
 * `AuthTokenResponse.expiresIn` is "Token expiration time in seconds"
 * (https://api.gonitro.dev/openapi.json). There is no refresh token: the guide
 * says to "request a new token" when one is needed, so a refresh re-runs the
 * grant from the pair stored on `credentials.extra`.
 */

import axios, { isAxiosError } from 'axios'
import { customForm } from '@opensteward/shared'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { SIGN_API_HOSTS, SIGN_API_SERVERS, TOKEN_PATH } from './constants'

export const NITRO_SIGN_FIELDS: CredentialField[] = [
  {
    name: 'signApiBaseUrl',
    label: 'Region',
    type: 'select',
    required: true,
    options: SIGN_API_SERVERS.map((s) => ({ value: s.url, label: s.description })),
    helpText:
      'The region of your Nitro account: the one whose host matches the "Oauth Token endpoint" shown with your application in the Nitro Admin Portal (Settings → API).',
  },
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'Nitro Admin Portal → Settings → API → your application.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'Shown with the Client ID in the Nitro Admin Portal.',
  },
]

interface NitroSignTokenResponse {
  accessToken?: unknown
  tokenType?: unknown
  expiresIn?: unknown
}

function grantFailure(message: string, statusCode: number): Error {
  // `error: 'invalid_grant'` routes a refresh failure to "this connection must
  // reconnect": the client pair is the customer's own, so a rejection of it is
  // never the operator-wide `invalid_client` case.
  return Object.assign(new Error(message), { statusCode, error: 'invalid_grant' })
}

/** POST `{host}/oauth/token` with the documented JSON body. */
export async function requestAccessToken(
  host: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  let data: NitroSignTokenResponse
  try {
    ;({ data } = await axios.post<NitroSignTokenResponse>(
      `${host}${TOKEN_PATH}`,
      { clientID: clientId, clientSecret },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 30_000,
      },
    ))
  } catch (err) {
    // Every failure is re-thrown bare: the axios error carries the secret in
    // `config.data`, so it never leaves this function.
    const status = isAxiosError(err) ? err.response?.status : undefined
    if (status === 400 || status === 401) {
      throw grantFailure(
        `Nitro Sign rejected the client credentials (${status}) at ${host}${TOKEN_PATH}`,
        status,
      )
    }
    // 500, a timeout, no response: retryable, so no OAuth error code.
    const code = isAxiosError(err) ? err.code : undefined
    throw Object.assign(
      new Error(
        `Nitro Sign token endpoint ${host}${TOKEN_PATH} failed (${status ?? code ?? 'no response'})`,
      ),
      status === undefined ? { code } : { statusCode: status, code },
    )
  }
  if (typeof data?.accessToken !== 'string' || typeof data.expiresIn !== 'number') {
    throw new Error(
      `Nitro Sign token response from ${host}${TOKEN_PATH} lacks accessToken / expiresIn`,
    )
  }
  return {
    accessToken: data.accessToken,
    expiresAt: new Date(Date.now() + data.expiresIn * 1000),
    extra: { signApiBaseUrl: host, clientId, clientSecret },
  }
}

function regionHost(value: unknown): string {
  const host = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
  if (!SIGN_API_HOSTS.includes(host)) {
    throw Object.assign(new Error(`signApiBaseUrl must be one of ${SIGN_API_HOSTS.join(', ')}`), {
      statusCode: 400,
      code: 'VALIDATION',
    })
  }
  return host
}

export const NITRO_SIGN_FORM = customForm({
  fields: NITRO_SIGN_FIELDS,
  async exchange(input: Record<string, string>): Promise<Credentials> {
    const host = regionHost(input?.['signApiBaseUrl'])
    const clientId = (input?.['clientId'] ?? '').trim()
    const clientSecret = input?.['clientSecret'] ?? ''
    if (!clientId) throw Object.assign(new Error('Client ID is required.'), { statusCode: 400 })
    if (!clientSecret)
      throw Object.assign(new Error('Client secret is required.'), { statusCode: 400 })
    return requestAccessToken(host, clientId, clientSecret)
  },
})

/** Re-run the grant from the pair the connection stored. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const clientId = extra['clientId']
  const clientSecret = extra['clientSecret']
  if (
    typeof clientId !== 'string' ||
    !clientId ||
    typeof clientSecret !== 'string' ||
    !clientSecret
  ) {
    throw grantFailure('Nitro Sign connection has no stored client credentials; reconnect it', 401)
  }
  const host = extra['signApiBaseUrl']
  if (typeof host !== 'string' || !SIGN_API_HOSTS.includes(host)) {
    throw grantFailure('Nitro Sign connection has no stored region host; reconnect it', 401)
  }
  return requestAccessToken(host, clientId, clientSecret)
}

export function noAuthorizationCodeFlow(): Error {
  return Object.assign(
    new Error(
      'Nitro Sign authenticates with OAuth client credentials only; connect with credentialFields() / exchangeCredentials()',
    ),
    { statusCode: 400 },
  )
}
