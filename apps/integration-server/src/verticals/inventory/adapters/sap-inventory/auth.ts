/**
 * SAP S/4HANA Cloud — OAuth 2.0 Client Credentials auth.
 *
 * Flow: client_credentials grant against
 *   https://<tenantUrl>/sap/bc/sec/oauth2/token
 *
 * The tenantUrl (e.g. "my30xxxx-api.s4hana.ondemand.com") is stored
 * in credentials.extra.tenantUrl so every client call can build the
 * correct per-tenant base URL.
 *
 * References:
 *   https://community.sap.com/t5/technology-blog-posts-by-sap/step-by-step-calling-s-4hana-private-cloud-standard-odata-apis-with-oauth-2/ba-p/14346113
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'

const TOKEN_PATH = '/sap/bc/sec/oauth2/token'

export function credentialFields(): CredentialField[] {
  return [
    {
      name: 'tenantUrl',
      label: 'Tenant hostname (e.g. my30xxxx-api.s4hana.ondemand.com)',
      type: 'text',
      required: true,
    },
    {
      name: 'clientId',
      label: 'OAuth 2.0 Client ID',
      type: 'text',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'OAuth 2.0 Client Secret',
      type: 'password',
      required: true,
    },
  ]
}

/**
 * Build the OAuth token URL for this tenant.
 * Strips trailing slash and prepends https:// if absent.
 */
function tokenUrl(tenantUrl: string): string {
  const host = tenantUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${host}${TOKEN_PATH}`
}

/**
 * Exchange clientId + clientSecret for an access token.
 * Stores tenantUrl in extra so client.ts can build the base URL.
 */
export async function exchangeCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const { tenantUrl, clientId, clientSecret } = fields
  if (!tenantUrl) throw new Error('sap-inventory: tenantUrl is required')
  if (!clientId) throw new Error('sap-inventory: clientId is required')
  if (!clientSecret) throw new Error('sap-inventory: clientSecret is required')

  const url = tokenUrl(tenantUrl)
  const params = new URLSearchParams()
  params.set('grant_type', 'client_credentials')

  const resp = await axios.post<{ access_token: string; expires_in?: number }>(
    url,
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
      timeout: 15_000,
    },
  )

  const expiresIn = resp.data.expires_in ?? 3600
  return {
    accessToken: resp.data.access_token,
    extra: {
      tenantUrl: tenantUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      expiresAt: String(Date.now() + expiresIn * 1000),
      clientId,
      clientSecret,
    },
  }
}

/**
 * Refresh by re-running client_credentials.  SAP tokens typically
 * expire in 3600 s; the adapter refreshes proactively.
 */
export async function refreshCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  const { tenantUrl, clientId, clientSecret } = credentials.extra as Record<string, string>
  if (!tenantUrl || !clientId || !clientSecret) return credentials

  return exchangeCredentials({ tenantUrl, clientId, clientSecret })
}

/** SAP Cloud does not use a redirect-based OAuth flow for server-to-server. */
export function getAuthUrl(_state: string, _scopes?: string[]): never {
  throw new Error(
    'sap-inventory uses OAuth 2.0 client-credentials; use credentialFields() instead of getAuthUrl()',
  )
}

/** exchangeCode is not applicable for client-credentials flow. */
export async function exchangeCode(
  _code: string,
  _redirectUri: string,
): Promise<Credentials> {
  throw new Error(
    'sap-inventory uses OAuth 2.0 client-credentials; exchangeCode() is not supported',
  )
}
