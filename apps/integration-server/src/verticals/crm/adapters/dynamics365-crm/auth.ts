import type { Credentials } from '@opensteward/shared'
import { MS_LOGIN_BASE } from './constants'

/**
 * Dataverse environment hosts, per Microsoft's datacenter-region list
 * (https://learn.microsoft.com/power-platform/admin/new-datacenter-regions):
 * commercial `{org}.crm[N].dynamics.com`, GCC High `{org}.crm.microsoftdynamics.us`,
 * Germany `{org}.crm.microsoftdynamics.de`, China `{org}.crm.dynamics.cn`.
 */
const DATAVERSE_HOST =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:crm\d*\.dynamics\.com|crm\.microsoftdynamics\.us|crm\.microsoftdynamics\.de|crm\.dynamics\.cn)$/

const INSTANCE_REQUIRED =
  'Dynamics 365 instance URL is required (e.g. https://yourorg.crm.dynamics.com).'
const INSTANCE_FOREIGN =
  'Dynamics 365 instance URL must be a Dataverse host such as yourorg.crm.dynamics.com.'

/**
 * Reduce a customer-typed Dynamics 365 environment to `https://{org}.{region
 * domain}`: `contoso.crm4.dynamics.com`, a pasted `https://contoso.crm4.dynamics.com/main.aspx?…`
 * and mixed case all normalise to `https://contoso.crm4.dynamics.com`.
 *
 * The org host is embedded in the authorize scope and receives the bearer
 * token, so anything outside Microsoft's Dataverse domains — including a
 * non-https scheme, embedded credentials or an explicit port — is refused.
 */
export function normaliseInstanceUrl(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) throw new Error(INSTANCE_REQUIRED)
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    throw new Error(INSTANCE_FOREIGN)
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !DATAVERSE_HOST.test(url.hostname)
  ) {
    throw new Error(INSTANCE_FOREIGN)
  }
  return `https://${url.hostname}`
}

function tokenUrl(tenantId: string): string {
  return `${MS_LOGIN_BASE}/${tenantId}/oauth2/v2.0/token`
}

function dataverseScope(instanceUrl: string): string {
  return `${instanceUrl}/.default offline_access`
}

export function getAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  tenantId: string,
  instanceUrl: string | undefined,
): string {
  const instance = normaliseInstanceUrl(instanceUrl)
  const url = new URL(`${MS_LOGIN_BASE}/${tenantId}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', dataverseScope(instance))
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tenantId: string,
  instanceUrl: string | undefined,
): Promise<Credentials> {
  const instance = normaliseInstanceUrl(instanceUrl)
  const res = await fetch(tokenUrl(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: dataverseScope(instance),
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Dynamics365 token exchange failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: { instanceUrl: instance, tenantId },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const tenantId = String(credentials.extra?.['tenantId'] ?? 'common')
  const stored = credentials.extra?.['instanceUrl']
  const scope =
    typeof stored === 'string' && stored
      ? dataverseScope(normaliseInstanceUrl(stored))
      : 'offline_access'

  const res = await fetch(tokenUrl(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Dynamics365 token refresh failed: ${text}`)
  }
  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
