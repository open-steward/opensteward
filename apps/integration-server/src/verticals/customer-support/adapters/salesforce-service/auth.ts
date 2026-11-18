/**
 * Salesforce OAuth 2.0 web server flow (authorization code grant).
 *
 * Sources, fetched 2026-09-28:
 *   - Web server flow:
 *     https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_web_server_flow.htm&type=5
 *   - Refresh token flow:
 *     https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_refresh_token_flow.htm&type=5
 *   - Endpoints (login vs test host):
 *     https://help.salesforce.com/s/articleView?id=xcloud.remoteaccess_oauth_endpoints.htm&type=5
 *
 * Same shape as crm/salesforce/auth.ts (client credentials in the form body,
 * `instance_url` kept in `credentials.extra.instanceUrl`), plus the sandbox
 * host, which that adapter does not offer. It is a copy rather than an
 * import: integration-server compiles each vertical as its own project and
 * customer-support references only the kernel, so importing crm's module
 * would not typecheck under `tsc -b`.
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import { AUTHORIZE_PATH, LOGIN_HOSTS, TOKEN_PATH, type SalesforceEnvironment } from './constants'

/**
 * Production and sandbox orgs log in on different hosts, and the token
 * endpoint must be the host the code was issued on, so the org kind is asked
 * for before the redirect.
 */
export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'environment',
      label: 'Salesforce org type',
      type: 'select',
      required: true,
      options: [
        { value: 'production', label: 'Production / Developer Edition (login.salesforce.com)' },
        { value: 'sandbox', label: 'Sandbox (test.salesforce.com)' },
      ],
      helpText: 'Choose Sandbox only if you log in to this org at test.salesforce.com.',
    },
  ]
}

/** A blank or missing choice is production, the host the docs' examples use. */
export function resolveEnvironment(raw: unknown): SalesforceEnvironment {
  if (raw === undefined || raw === null || raw === '') return 'production'
  if (raw === 'production' || raw === 'sandbox') return raw
  throw new Error(`Salesforce org type must be "production" or "sandbox" (got "${String(raw)}").`)
}

export function tokenUrl(environment: SalesforceEnvironment): string {
  return `${LOGIN_HOSTS[environment]}${TOKEN_PATH}`
}

/**
 * `response_type=code`, `client_id`, `redirect_uri` (required) and the
 * optional `scope` and `state` — the parameters the web server flow page
 * lists for "Request an Authorization Code".
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  environment: SalesforceEnvironment,
): string {
  const url = new URL(`${LOGIN_HOSTS[environment]}${AUTHORIZE_PATH}`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  if (scopes.length > 0) url.searchParams.set('scope', scopes.join(' '))
  url.searchParams.set('state', state)
  return url.toString()
}

/**
 * The token response fields this adapter reads. The web server flow response
 * documents access_token, signature, scope, id_token, instance_url, id,
 * token_type, issued_at and, when the app has the refresh_token scope,
 * refresh_token. There is no `expires_in`: "The connected app's session
 * timeout value determines when an access token is no longer valid" (refresh
 * token flow page), so `expiresAt` is left unset.
 */
interface TokenResponse {
  access_token?: string
  refresh_token?: string
  instance_url?: string
  id?: string
  scope?: string
}

/** The API host. It comes from the provider, over TLS, but is still checked to be https. */
function checkedInstanceUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Salesforce returned an unusable instance_url: ${raw}`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`Salesforce returned a non-https instance_url: ${raw}`)
  }
  return url.origin
}

async function postToken(
  environment: SalesforceEnvironment,
  body: Record<string, string>,
  what: string,
): Promise<TokenResponse> {
  const res = await fetch(tokenUrl(environment), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`Salesforce ${what} failed (${res.status}): ${text}`), {
      statusCode: res.status,
    })
  }
  const json = (await res.json()) as TokenResponse
  if (!json.access_token) throw new Error(`Salesforce ${what} returned no access_token`)
  return json
}

/**
 * "Request an Access Token": POST `grant_type=authorization_code`, `code`,
 * `client_id`, `client_secret`, `redirect_uri` form-encoded to the token
 * endpoint. The client credentials go in the body, as the documented example
 * does. `code_verifier` is never sent: it is "Required only if a
 * code_challenge parameter was specified in the authorization request", and
 * a verifier without one "fails with the invalid_grant error code". This
 * adapter does not declare PKCE, so buildAuthUrl sends no code_challenge.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  environment: SalesforceEnvironment,
): Promise<Credentials> {
  const json = await postToken(
    environment,
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
    'token exchange',
  )
  const instanceUrl = checkedInstanceUrl(json.instance_url)
  if (!instanceUrl) throw new Error('Salesforce token exchange returned no instance_url')
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token,
    scope: json.scope,
    extra: {
      instanceUrl,
      environment,
      ...(json.id ? { identityUrl: json.id } : {}),
    },
  }
}

/**
 * "Request an Updated Access Token": POST `grant_type=refresh_token`,
 * `refresh_token`, `client_id`, `client_secret` to the token endpoint of the
 * host the grant came from. The response carries `instance_url` again, and a
 * new `refresh_token` only "if you enable refresh token rotation", so the old
 * one is kept when none comes back.
 */
export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error(
      'Salesforce connection has no refresh token: reconnect with the refresh_token scope',
    )
  }
  const environment = resolveEnvironment(credentials.extra?.['environment'])
  const json = await postToken(
    environment,
    {
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    'token refresh',
  )
  const instanceUrl = checkedInstanceUrl(json.instance_url)
  return {
    ...credentials,
    accessToken: json.access_token!,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    scope: json.scope ?? credentials.scope,
    extra: {
      ...credentials.extra,
      environment,
      ...(instanceUrl ? { instanceUrl } : {}),
    },
  }
}
