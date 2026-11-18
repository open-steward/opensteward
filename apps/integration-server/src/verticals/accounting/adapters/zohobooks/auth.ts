import axios from 'axios'
import { normaliseDataCentre, zohoAuthorizeUrl, zohoBooksApiBase, zohoTokenUrl } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  dataCentre: string | undefined,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(','),
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${zohoAuthorizeUrl(normaliseDataCentre(dataCentre))}?${params.toString()}`
}

/** Zoho answers a bad grant with HTTP 200 and `{ error }`; surface it instead of storing an undefined token. */
function assertNoTokenError(data: Record<string, unknown>): void {
  if (typeof data['error'] === 'string') {
    throw new Error(`Zoho token request failed: ${data['error']}`)
  }
}

interface ZohoOrganizationsResponse {
  organizations?: Array<{ organization_id?: string | number; is_default_org?: boolean }>
}

/**
 * Every Zoho Books request carries `organization_id`. It is not in the token
 * response, so read the user's organizations straight after the exchange and
 * record the default one.
 */
async function fetchDefaultOrganizationId(dataCentre: string, accessToken: string): Promise<string> {
  const { data } = await axios.get<ZohoOrganizationsResponse>(`${zohoBooksApiBase(dataCentre)}/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' },
  })
  const orgs = data?.organizations ?? []
  const chosen = orgs.find((o) => o.is_default_org) ?? orgs[0]
  if (!chosen || chosen.organization_id === undefined || String(chosen.organization_id) === '') {
    throw new Error('This Zoho account has no Zoho Books organization.')
  }
  return String(chosen.organization_id)
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  rawDataCentre: string | undefined,
): Promise<Credentials> {
  const dataCentre = normaliseDataCentre(rawDataCentre)
  const { data } = await axios.post<Record<string, unknown>>(
    zohoTokenUrl(dataCentre),
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  assertNoTokenError(data)
  const creds = parseTokenResponse(data)
  const organizationId = await fetchDefaultOrganizationId(dataCentre, creds.accessToken)
  return { ...creds, tenantId: organizationId, extra: { dataCentre, organizationId } }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  rawDataCentre: string | undefined,
): Promise<Credentials> {
  const dataCentre = normaliseDataCentre(rawDataCentre)
  const { data } = await axios.post<Record<string, unknown>>(
    zohoTokenUrl(dataCentre),
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  assertNoTokenError(data)
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
