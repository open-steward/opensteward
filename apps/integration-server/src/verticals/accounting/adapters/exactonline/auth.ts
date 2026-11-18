import axios from 'axios'
import { getAuthUrl, getBaseUrl, getTokenUrl, normaliseRegion } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  region: string | undefined,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    force_login: '0',
  })
  return `${getAuthUrl(normaliseRegion(region))}?${params.toString()}`
}

interface ExactMeResponse {
  d?: { results?: Array<{ CurrentDivision?: number | string | null }> }
}

/**
 * Every REST path carries a division (`/api/v1/{division}/…`). It is not in
 * the token response, so read the user's current division straight after the
 * exchange.
 */
async function fetchCurrentDivision(region: string, accessToken: string): Promise<string> {
  const { data } = await axios.get<ExactMeResponse>(`${getBaseUrl(region)}/v1/current/Me`, {
    params: { $select: 'CurrentDivision' },
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const division = data?.d?.results?.[0]?.CurrentDivision
  if (division === undefined || division === null || String(division) === '') {
    throw new Error('Exact Online did not return a current division for this user.')
  }
  return String(division)
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  rawRegion: string | undefined,
): Promise<Credentials> {
  const region = normaliseRegion(rawRegion)
  const { data } = await axios.post<Record<string, unknown>>(
    getTokenUrl(region),
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const creds = parseTokenResponse(data)
  const division = await fetchCurrentDivision(region, creds.accessToken)
  return { ...creds, tenantId: division, extra: { region, division } }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  rawRegion: string | undefined,
): Promise<Credentials> {
  const region = normaliseRegion(rawRegion)
  const { data } = await axios.post<Record<string, unknown>>(
    getTokenUrl(region),
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
