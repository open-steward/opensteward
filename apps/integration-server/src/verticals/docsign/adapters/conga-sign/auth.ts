/**
 * Conga Sign OAuth2 helpers.
 *
 * Conga Sign authenticates with the OAuth2 client-credentials grant
 * (machine-to-machine): the integration POSTs its client id + secret to the
 * regional login host's `/api/v1/auth/connect/token` endpoint and receives a
 * short-lived Bearer access token (typically 3600s). There is no end-user
 * authorization-code redirect, so `getAuthUrl` is not applicable; tokens are
 * minted directly and refreshed by re-running the grant.
 *
 * The client credentials and the region belong to the customer's Conga
 * tenant, so they are collected on the Connect page (`credentialFields`) and
 * kept on `credentials.extra` for the refresh grant and the REST client.
 *
 * Docs: https://documentation.conga.com/en/sign-for-salesforce/current/conga-sign-for-rest-api-developers/obtain-the-jwt-access-token
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_REGION,
  OAUTH_TOKEN_PATH,
  REGION_HOSTS,
  type CongaSignRegion,
} from './constants'

const REGIONS = Object.keys(REGION_HOSTS) as CongaSignRegion[]

/**
 * Validate a region against the closed set of Conga Sign regions. The region
 * picks the host the client secret is POSTed to, so an unknown value is
 * refused rather than mapped to a default.
 */
export function normaliseCongaSignRegion(raw: unknown): CongaSignRegion {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!s) throw new Error('Conga Sign region is required.')
  if (!(REGIONS as string[]).includes(s)) {
    throw new Error(`Conga Sign region must be one of: ${REGIONS.join(', ')}.`)
  }
  return s as CongaSignRegion
}

/** The region a stored connection uses. Connections minted before regions were stored are prod-us. */
export function connectionCongaSignRegion(credentials: Credentials): CongaSignRegion {
  const stored = credentials.extra?.['region']
  return stored === undefined || stored === null ? DEFAULT_REGION : normaliseCongaSignRegion(stored)
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

/**
 * Run the client-credentials grant against the regional login host and return
 * canonical Credentials. The region is round-tripped into `extra.region` so the
 * REST client can resolve the matching RLS host.
 */
export async function clientCredentialsGrant(
  clientId: string,
  clientSecret: string,
  scopes: string[],
  region: CongaSignRegion,
): Promise<Credentials> {
  const loginBaseUrl = REGION_HOSTS[normaliseCongaSignRegion(region)].loginBaseUrl
  const { data } = await axios.post<TokenResponse>(
    `${loginBaseUrl}${OAUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes.join(' '),
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? scopes.join(' '),
    extra: { region },
  }
}

/**
 * Re-run the grant with the client credentials and region stored on the
 * connection; deployment config is only a fallback for connections created
 * before they were stored.
 */
export async function refreshCredentials(
  credentials: Credentials,
  fallbackClientId: string | undefined,
  fallbackClientSecret: string | undefined,
  scopes: string[],
  fallbackRegion: string | undefined,
): Promise<Credentials> {
  const stored = credentials.extra ?? {}
  const clientId =
    typeof stored['clientId'] === 'string' && stored['clientId'] ? stored['clientId'] : fallbackClientId
  const clientSecret =
    typeof stored['clientSecret'] === 'string' && stored['clientSecret']
      ? stored['clientSecret']
      : fallbackClientSecret
  if (!clientId || !clientSecret) {
    throw new Error('Conga Sign client ID and client secret are required.')
  }
  const region =
    stored['region'] !== undefined
      ? normaliseCongaSignRegion(stored['region'])
      : normaliseCongaSignRegion(fallbackRegion ?? DEFAULT_REGION)
  const fresh = await clientCredentialsGrant(clientId, clientSecret, scopes, region)
  return { ...fresh, extra: { ...stored, region } }
}
