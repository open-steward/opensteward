/**
 * Elastic Path auth — OAuth2 client-credentials flow.
 *
 * Elastic Path issues tokens via `POST {baseUrl}/oauth/access_token` with
 * `grant_type=client_credentials`, `client_id`, and `client_secret` as
 * form-urlencoded body. Tokens expire in ~3600s. No refresh_token —
 * re-run the same call to get a new token.
 *
 * Credentials shape:
 *   { accessToken, expiresAt, extra: { baseUrl, clientId, clientSecret, region } }
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_SECONDS, TOKEN_ENDPOINT, REGIONS, DEFAULT_REGION } from './constants'

export function resolveBaseUrl(region: string | undefined): string {
  const slug = region ?? DEFAULT_REGION
  const url = REGIONS[slug]
  if (!url) {
    throw new Error(
      `Elastic Path: unknown region '${slug}'. Supported regions: ${Object.keys(REGIONS).join(', ')}`,
    )
  }
  return url
}

export function buildAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/oauth/access_token`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Elastic Path uses OAuth2 client-credentials — no authorization code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "elasticpath", credentials: {clientId, clientSecret, region}}`. ' +
      'The adapter bootstraps tokens automatically via refreshCredentials.',
  )
}

/**
 * Fetch a new access token using client-credentials grant.
 */
export async function fetchToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const url = `${baseUrl.replace(/\/$/, '')}${TOKEN_ENDPOINT}`
  const res = await axios.post<{ access_token: string; token_type: string; expires_in: number }>(
    url,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('Elastic Path token endpoint returned an empty access_token')
  }
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_SECONDS * 1000),
  }
}

/**
 * Refresh credentials by re-running the client-credentials grant.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const region = credentials.extra?.['region'] as string | undefined
  const resolvedBaseUrl = baseUrl ?? resolveBaseUrl(region)

  if (!clientId || !clientSecret) {
    throw new Error(
      'Elastic Path refreshCredentials requires clientId and clientSecret in credentials.extra.',
    )
  }
  const { accessToken, expiresAt } = await fetchToken(resolvedBaseUrl, clientId, clientSecret)
  return {
    ...credentials,
    accessToken,
    expiresAt,
  }
}
