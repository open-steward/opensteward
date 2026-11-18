import axios from 'axios'
import { FATTURE_API_BASE, FATTURE_AUTH_URL, FATTURE_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { parseTokenResponse } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${FATTURE_AUTH_URL}?${params.toString()}`
}

interface FattureUserCompany {
  id?: number | string | null
  name?: string | null
}

interface FattureUserCompaniesResponse {
  data?: { companies?: FattureUserCompany[] }
}

/**
 * Every resource lives under `/c/{company_id}/…`, and one user (hence one
 * token) can reach several companies. List them after the exchange: use the
 * only one, or the one the customer named (by id or exact name), and refuse to
 * guess between several.
 *
 * Docs: https://developers.fattureincloud.it/docs/basics/company-scoped-methods/
 */
export async function resolveCompanyId(accessToken: string, requested?: string): Promise<string> {
  const { data } = await axios.get<FattureUserCompaniesResponse>(`${FATTURE_API_BASE}/user/companies`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  const companies = (data?.data?.companies ?? []).filter(
    (c) => c.id !== undefined && c.id !== null && String(c.id) !== '',
  )
  const want = (requested ?? '').trim()
  if (want) {
    const lower = want.toLowerCase()
    const match =
      companies.find((c) => String(c.id) === want) ??
      companies.find((c) => (c.name ?? '').trim().toLowerCase() === lower)
    if (!match) throw new Error(`Fatture in Cloud company "${want}" is not one this user can access.`)
    return String(match.id)
  }
  if (companies.length === 0) throw new Error('This Fatture in Cloud user has no companies.')
  if (companies.length > 1) {
    const list = companies.map((c) => `${c.name ?? 'unnamed'} [${c.id}]`).join(', ')
    throw new Error(
      `This Fatture in Cloud user can access several companies (${list}); reconnect and enter the ID or name of the one to use.`,
    )
  }
  return String(companies[0].id)
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  requestedCompany?: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    FATTURE_TOKEN_URL,
    { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const creds = parseTokenResponse(data)
  const companyId = await resolveCompanyId(creds.accessToken, requestedCompany)
  return { ...creds, tenantId: companyId, extra: { companyId } }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    FATTURE_TOKEN_URL,
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
    { headers: { 'Content-Type': 'application/json' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
