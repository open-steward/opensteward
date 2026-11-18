/**
 * Zoho Desk OAuth 2.0 (server-based apps), on the customer's data centre.
 *
 * - Authorize: GET {accounts-server-url}/oauth/v2/auth with response_type=code,
 *   client_id, redirect_uri, scope, access_type=offline (a refresh token is
 *   issued only then), prompt=consent.
 *   https://www.zoho.com/accounts/protocol/oauth/web-apps/authorization.html
 * - Token: POST {accounts-server-url}/oauth/v2/token with client_id,
 *   client_secret, grant_type=authorization_code, code, redirect_uri.
 *   https://www.zoho.com/accounts/protocol/oauth/web-apps/access-token.html
 * - Refresh: the same endpoint with grant_type=refresh_token and
 *   refresh_token. The response carries no new refresh token, so the stored
 *   one is kept.
 *   https://www.zoho.com/accounts/protocol/oauth/web-apps/access-token-expiry.html
 *   That page also states how the token endpoint takes its parameters: "(2)
 *   Request Body All parameters can be sent in the request body using the data
 *   type form-data or x-www-form-urlencoded". Both grants here send them
 *   form-encoded (client_secret_post), as accounting/zohobooks does.
 *
 * Every Desk API call except the organization endpoints carries an `orgId`
 * header ("All API endpoints except /organizations mandatorily require the
 * orgId", https://desk.zoho.com/DeskAPIDocument). It is not in the token
 * response, so the exchange reads it straight afterwards (see
 * {@link fetchOrgId}) and stores it in `credentials.extra.orgId`.
 */
import axios from 'axios'
import { parseTokenResponse, type Credentials } from '@opensteward/shared'
import { normaliseDataCentre, zohoAuthorizeUrl, zohoDeskApiBase, zohoTokenUrl } from './constants'

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

/**
 * Zoho can answer a failed grant with `{ error }` (invalid_code,
 * invalid_client, invalid_client_secret, ...). Surface it instead of storing an
 * undefined token. Same check as accounting/zohobooks.
 */
function assertNoTokenError(data: Record<string, unknown>): void {
  if (typeof data['error'] === 'string') {
    throw new Error(`Zoho token request failed: ${data['error']}`)
  }
  if (typeof data['access_token'] !== 'string' || !data['access_token']) {
    throw new Error('Zoho token response carried no access_token.')
  }
}

interface RawZohoDeskOrganization {
  id?: string | number
}

/**
 * The Desk organization this token works on.
 *
 * "Get accessible organizations: This API lists all organizations which can be
 * accessed using the current Oauth token." (GET /api/v1/accessibleOrganizations).
 * A token is bound to one organization at consent: "If they have multiple
 * organizations, they must manually select the one to which the token should
 * be linked", and "Zoho Desk APIs automatically extract organization
 * information from the OAuth token. Therefore, it is not necessary to include
 * the orgId ... in the request headers", so this call is made without one.
 * One organization is the only answer that names the bound one. With several,
 * nothing documented in the response says which one the token is bound to
 * (`isDefault` is not described as the binding), and "if [the orgId] is
 * provided, ensure that the orgId value matches the portal associated with the
 * OAuth token ... the API call fails and returns the OAUTH_ORG_MISMATCH
 * error", so several are refused rather than guessed.
 * https://desk.zoho.com/DeskAPIDocument (Organizations, Organization Binding)
 */
export async function fetchOrgId(dataCentre: string, accessToken: string): Promise<string> {
  const { data } = await axios.get<{ data?: RawZohoDeskOrganization[] }>(
    `${zohoDeskApiBase(dataCentre)}/accessibleOrganizations`,
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json' } },
  )
  const orgs = (data?.data ?? []).filter((o) => o.id !== undefined && String(o.id) !== '')
  if (orgs.length !== 1) {
    throw new Error(
      orgs.length === 0
        ? 'This Zoho account has no Zoho Desk organization this token can access.'
        : `This Zoho token lists ${orgs.length} Zoho Desk organizations and does not say which one it is bound to; refusing to guess the orgId.`,
    )
  }
  return String(orgs[0]!.id)
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  rawDataCentre: string | undefined,
): Promise<Credentials> {
  // Normalised before anything is sent: the data centre picks the host that
  // receives the client secret.
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
  const orgId = await fetchOrgId(dataCentre, creds.accessToken)
  return { ...creds, tenantId: orgId, extra: { dataCentre, orgId } }
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
