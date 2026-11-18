/**
 * Dynamics 365 SCM — OAuth 2.0 client-credentials auth.
 *
 * D365 SCM uses Microsoft Entra (Azure AD) for authentication.
 * Customers supply:
 *   • tenantHost     — their F&O environment hostname, e.g. "contoso.operations.dynamics.com"
 *   • aadTenantId    — Azure AD directory (tenant) ID (GUID)
 *   • clientId       — Azure AD app registration client ID
 *   • clientSecret   — Azure AD app registration client secret
 *   • environmentId  — D365 SCM environment ID (for Inventory Visibility API)
 *   • organizationId — Data-area / legal-entity ID used in IV queries (e.g. "usmf")
 *
 * Token flow (OData / standard F&O APIs):
 *   POST https://login.microsoftonline.com/{aadTenantId}/oauth2/v2.0/token
 *   grant_type=client_credentials, scope=https://{tenantHost}/.default
 *   → access_token used as Bearer on all OData requests
 *
 * Token flow (Inventory Visibility API):
 *   Step 1: same Entra client-credentials call with scope 0cdb527f-.../.default
 *   Step 2: exchange Entra token for IV service token via securityservice endpoint
 *   The IV access token is stored in credentials.extra.ivAccessToken.
 *
 * Tokens are refreshed by re-running both flows; no refresh_token is issued.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  getEntraTokenUrl,
  IV_SECURITY_TOKEN_URL,
  ENTRA_SCOPE_FOR_IV,
  IV_TOKEN_SCOPE,
} from './constants'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenantHost',
      label: 'F&O Tenant Host',
      type: 'text',
      placeholder: 'contoso.operations.dynamics.com',
      required: true,
    },
    {
      name: 'aadTenantId',
      label: 'Azure AD Tenant ID',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: true,
    },
    {
      name: 'clientId',
      label: 'Client ID (App Registration)',
      type: 'text',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Client Secret',
      type: 'password',
      required: true,
    },
    {
      name: 'environmentId',
      label: 'SCM Environment ID',
      type: 'text',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      required: true,
    },
    {
      name: 'organizationId',
      label: 'Legal Entity / Data Area ID',
      type: 'text',
      placeholder: 'usmf',
      required: true,
    },
  ]
}

/** Fetch a standard Entra client-credentials token for the F&O OData API. */
export async function fetchODataAccessToken(
  aadTenantId: string,
  clientId: string,
  clientSecret: string,
  tenantHost: string,
): Promise<{ accessToken: string; expiresAt?: Date }> {
  const tokenUrl = getEntraTokenUrl(aadTenantId)
  const scope = `https://${tenantHost}/.default`
  const { data } = await axios.post<{ access_token: string; expires_in?: number }>(
    tokenUrl,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined
  return { accessToken: data.access_token, expiresAt }
}

/** Fetch the two-step Inventory Visibility access token. */
export async function fetchIvAccessToken(
  aadTenantId: string,
  clientId: string,
  clientSecret: string,
  environmentId: string,
): Promise<string> {
  // Step 1: Entra token with IV resource scope
  const entraTokenUrl = getEntraTokenUrl(aadTenantId)
  const { data: entraData } = await axios.post<{ access_token: string }>(
    entraTokenUrl,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: ENTRA_SCOPE_FOR_IV,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )

  // Step 2: exchange Entra token for IV service token
  const { data: ivData } = await axios.post<{ access_token: string }>(
    IV_SECURITY_TOKEN_URL,
    {
      grant_type: 'client_credentials',
      client_assertion_type: 'aad_app',
      client_assertion: entraData.access_token,
      scope: IV_TOKEN_SCOPE,
      context: environmentId,
      context_type: 'finops-env',
    },
    { headers: { 'Api-Version': '1.0', 'Content-Type': 'application/json', Accept: 'application/json' } },
  )
  return ivData.access_token
}

/** Exchange credential form fields for persisted Credentials. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const { tenantHost, aadTenantId, clientId, clientSecret, environmentId, organizationId } = fields
  if (!tenantHost || !aadTenantId || !clientId || !clientSecret || !environmentId || !organizationId) {
    throw new Error('dynamics-365-scm: all credential fields are required')
  }

  const [odata, ivToken] = await Promise.all([
    fetchODataAccessToken(aadTenantId, clientId, clientSecret, tenantHost),
    fetchIvAccessToken(aadTenantId, clientId, clientSecret, environmentId),
  ])

  return {
    accessToken: odata.accessToken,
    expiresAt: odata.expiresAt,
    extra: { tenantHost, aadTenantId, clientId, clientSecret, environmentId, organizationId, ivAccessToken: ivToken },
  }
}

/** Re-run both token flows when the stored token expires. */
export async function refreshAccessTokens(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const tenantHost = String(extra['tenantHost'] ?? '')
  const aadTenantId = String(extra['aadTenantId'] ?? '')
  const clientId = String(extra['clientId'] ?? '')
  const clientSecret = String(extra['clientSecret'] ?? '')
  const environmentId = String(extra['environmentId'] ?? '')
  if (!tenantHost || !aadTenantId || !clientId || !clientSecret || !environmentId) return credentials

  const [odata, ivToken] = await Promise.all([
    fetchODataAccessToken(aadTenantId, clientId, clientSecret, tenantHost),
    fetchIvAccessToken(aadTenantId, clientId, clientSecret, environmentId),
  ])

  return {
    ...credentials,
    accessToken: odata.accessToken,
    expiresAt: odata.expiresAt,
    extra: { ...extra, ivAccessToken: ivToken },
  }
}
