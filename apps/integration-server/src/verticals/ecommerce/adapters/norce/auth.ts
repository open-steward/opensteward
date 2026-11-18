/**
 * Norce Commerce auth — OAuth2 client-credentials only.
 *
 * The token endpoint lives on the client's own host:
 *   `https://{clientName}.api-{region}.{environment}.norce.tech/identity/1.0/connect/token`
 * with `environment` omitted for production
 *   (`https://{clientName}.api-{region}.norce.tech/...`).
 * `scope` selects the environment (`prod` | `stage` | `playground`) — it is
 * NOT a per-permission scope. There is no refresh token: mint a new access
 * token via the same client-credentials grant, cache it for its reported
 * `expires_in`, and re-mint shortly before it lapses.
 *
 * The token endpoint is rate-limited (3 req/min, burst 20 — see
 * `check-secret-passthrough`-style caution: minting per request would blow
 * through that limit almost immediately), so callers must cache the token
 * (via `credentials.expiresAt`) rather than call this on every request.
 *
 * Docs: https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  FALLBACK_TOKEN_LIFETIME_SECONDS,
  TOKEN_ENDPOINT_PATH,
  TOKEN_REFRESH_SKEW_SECONDS,
} from './constants'

/** `prod` omits the environment segment entirely; everything else includes it. */
export function buildHost(clientName: string, region: string, environment: string): string {
  const env = environment.toLowerCase()
  return env === 'prod'
    ? `${clientName}.api-${region}.norce.tech`
    : `${clientName}.api-${region}.${env}.norce.tech`
}

export function tokenUrl(host: string): string {
  return `https://${host}${TOKEN_ENDPOINT_PATH}`
}

/** Commerce Query base URL — same host that issues tokens. */
export function queryBaseUrl(host: string): string {
  return `https://${host}/commerce/query/2.0`
}

interface NorceTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

/**
 * Mint a new access token via the client-credentials grant. Always reads
 * `expires_in` from the response rather than assuming the documented 3600s,
 * per the docs' own caution against hardcoding it.
 */
export async function fetchToken(
  host: string,
  clientId: string,
  clientSecret: string,
  environment: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: environment.toLowerCase(),
  })
  const res = await axios.post<NorceTokenResponse>(tokenUrl(host), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 30_000,
  })
  if (!res.data.access_token) {
    throw new Error('Norce token endpoint returned an empty access_token')
  }
  const lifetime = res.data.expires_in ?? FALLBACK_TOKEN_LIFETIME_SECONDS
  const safeLifetime = Math.max(lifetime - TOKEN_REFRESH_SKEW_SECONDS, 0)
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + safeLifetime * 1000),
  }
}

/**
 * Norce has no browser-redirect OAuth flow — the Connect page collects
 * credentials directly (see `./connect-form.ts`). `getAuthUrl` only points
 * the operator at the reference docs describing how to obtain the pieces the
 * form asks for.
 */
export function buildInfoUrl(): string {
  return 'https://docs.norce.io/api-reference/accessing-apis-with-oauth2-accounts'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Norce uses OAuth2 client-credentials only — there is no authorization-code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "norce", credentials: {clientName, region, environment, clientId, clientSecret, applicationId}}`.',
  )
}

/** Re-run the client-credentials grant using the fields stashed at connect time. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const host = credentials.extra?.['host'] as string | undefined
  const environment = credentials.extra?.['environment'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!host || !environment || !clientId || !clientSecret) {
    throw new Error(
      'Norce refreshCredentials requires host, environment, clientId, and clientSecret ' +
        'in credentials.extra — re-create the connection with the required fields.',
    )
  }
  const { accessToken, expiresAt } = await fetchToken(host, clientId, clientSecret, environment)
  return { ...credentials, accessToken, expiresAt }
}
