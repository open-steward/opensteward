import axios from 'axios'
import { XERO_AUTH_URL, XERO_TOKEN_URL, XERO_CONNECTIONS_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'

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
  return `${XERO_AUTH_URL}?${params.toString()}`
}



/**
 * Resolves the Xero tenant to bind the connection to.
 *
 * Returns undefined only for the real answer — a grant that authorised no
 * organisations. A failing connections call propagates instead: `tenantId` is sent as
 * the `Xero-tenant-id` header on every subsequent request and is matched against
 * inbound webhooks, so swallowing the failure would store a connection that reports
 * success at connect time and then fails every call with an opaque Xero error.
 */
async function fetchTenantId(accessToken: string): Promise<string | undefined> {
  const { data } = await axios.get<Array<{ tenantId: string; tenantType: string }>>(
    XERO_CONNECTIONS_URL,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  )
  // A 200 whose body is not the documented array is a Xero-side surprise, not a
  // grant with no organisations. Say that, rather than letting `.find` throw a
  // bare TypeError that reads like a bug in this adapter.
  if (!Array.isArray(data)) {
    throw new Error('Xero /connections returned an unexpected body; cannot resolve a tenant id')
  }
  const org = data.find((c) => c.tenantType === 'ORGANISATION') ?? data[0]
  return org?.tenantId
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    XERO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data)
  creds.tenantId = await fetchTenantId(creds.accessToken)
  return creds
}

/**
 * Refresh the access token, and keep the connection usable afterwards.
 *
 * `Xero-tenant-id` is sent on every accounting call — the API is scoped by it —
 * and this function used to return the new tokens and nothing else. It neither
 * re-resolved the tenant nor carried the existing one forward, so the FIRST
 * keep-alive refresh dropped it and every later call came back
 * `403 AuthenticationUnsuccessful` with a valid token and a refresh the store
 * had recorded as `ok`. Observed live: a sync returned 78 invoices, the
 * refresher ran seventeen minutes later reporting success, and the next sync
 * failed every resource while `/connections` still showed the grant healthy.
 *
 * Re-resolved rather than merely carried forward, because a tenant is not
 * immutable: an owner can disconnect an org and connect another against the
 * same grant, leaving a carried-forward id pointing somewhere this token can no
 * longer read. `knownTenantId` is the fallback for when `/connections` itself
 * fails — losing the tenant is the bug being fixed, so a transient outage must
 * not cost us one.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  knownTenantId?: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    XERO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  try {
    creds.tenantId = (await fetchTenantId(creds.accessToken)) ?? knownTenantId
  } catch {
    creds.tenantId = knownTenantId
  }
  return creds
}
