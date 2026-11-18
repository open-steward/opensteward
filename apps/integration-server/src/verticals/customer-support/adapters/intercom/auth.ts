/**
 * Intercom OAuth for public apps, per Intercom's "Setting up OAuth" guide
 * (fetched 2026-09-28):
 * https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth
 *
 * Intercom's authentication page forbids the alternative: "Asking your users
 * for their Access Tokens rather than implementing OAuth is against our terms
 * of service and may result in your API access being revoked."
 * https://developers.intercom.com/docs/build-an-integration/learn-more/authentication
 *
 * 1. Authorize: redirect to `https://app{.eu|.au}.intercom.com/oauth` with
 *    `client_id` and `state`, and optionally `redirect_uri` ("you can choose
 *    which URL to use when you're initiating the OAuth flow via the
 *    redirect_uri parameter"). There is no scope parameter: scopes are ticked
 *    on the app's Authorization page in the Developer Hub ("You select OAuth
 *    scopes when you are configuring OAuth in your Developer Hub").
 * 2. Exchange: POST `https://api.intercom.io/auth/eagle/token` with `code`,
 *    `client_id` and `client_secret` in the body. The guide's Ruby example
 *    sends them with `Net::HTTP.post_form`, i.e. form-encoded.
 * 3. The response is `{ token_type: 'Bearer', token, access_token }`, where
 *    `access_token` is "A duplicate of the Access Token above". No refresh
 *    token and no expiry are part of the response.
 *
 * Region: "Intercom hosts workspaces in three regions, and each region has its
 * own authorization host." The API host differs per region too (OpenAPI
 * `servers:`), and nothing in the token response names the region, so the
 * customer picks it on the Connect page before the redirect.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URLS, OAUTH_TOKEN_URL, REGIONS, type IntercomRegion } from './constants'

/** The one input collected before the redirect: the workspace's hosting region. */
export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'region',
      label: 'Intercom data hosting region',
      type: 'select',
      required: true,
      options: [
        { value: 'us', label: 'United States (app.intercom.com)' },
        { value: 'eu', label: 'Europe (app.eu.intercom.com)' },
        { value: 'au', label: 'Australia (app.au.intercom.com)' },
      ],
      helpText:
        'The region your Intercom workspace is hosted in: the host you sign in at (app.intercom.com, app.eu.intercom.com or app.au.intercom.com).',
    },
  ]
}

/** `us`, `eu` or `au`, whatever the case or surrounding space. Anything else throws before a request. */
export function normaliseRegion(raw: unknown): IntercomRegion {
  const r = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!r) throw new Error('Intercom region is required (us, eu or au).')
  if (!(REGIONS as readonly string[]).includes(r)) {
    throw new Error(`Intercom region must be one of us, eu or au (got "${r}").`)
  }
  return r as IntercomRegion
}

/**
 * The authorize URL on the customer's regional host. `scopes` is accepted for
 * the `overrideScopes` contract and deliberately not sent: Intercom documents
 * no scope parameter, so the URL carries no `scope=` at all (the
 * scope-override parity test's "provider-side scope config" case).
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  region: unknown,
): string {
  const params = new URLSearchParams({ client_id: clientId, state })
  if (redirectUri) params.set('redirect_uri', redirectUri)
  return `${OAUTH_AUTHORIZE_URLS[normaliseRegion(region)]}?${params.toString()}`
}

interface TokenResponse {
  token_type?: string
  token?: string
  access_token?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  region: unknown,
): Promise<Credentials> {
  // Validated first: an unknown region must not cost a code exchange whose
  // token we could then not route anywhere.
  const r = normaliseRegion(region)
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret })
  const { data } = await axios.post<TokenResponse>(OAUTH_TOKEN_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  })
  const accessToken = data?.access_token || data?.token
  if (!accessToken) throw new Error('Intercom token exchange returned no access token')
  return { accessToken, extra: { region: r } }
}

/**
 * Nothing to refresh. The token response documents only `token_type`,
 * `token` and `access_token`: no `refresh_token` and no `expires_in`, so
 * there is neither a grant to call nor an expiry to act on. Returns the
 * credentials unchanged and sends nothing.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
