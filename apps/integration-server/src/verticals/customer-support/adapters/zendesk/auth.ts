import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL_TEMPLATE, OAUTH_TOKEN_URL_TEMPLATE } from './constants'

/**
 * The one thing Zendesk OAuth needs from the customer before the redirect:
 * authorize, token and API endpoints all live on `{subdomain}.zendesk.com`.
 *
 * Declared as `oauthFields`, not `credentialFields`. It used to be the latter,
 * which the Connect page renders only for non-OAuth adapters, so an OAuth
 * customer was never asked and the flow ran against a placeholder host.
 */
export function oauthFields(): CredentialField[] {
  return [
    {
      name: 'tenantSubdomain',
      label: 'Zendesk subdomain',
      type: 'text',
      required: true,
      placeholder: 'acme',
      helpText: 'The subdomain portion of your Zendesk URL (e.g. `acme` if your help center is `acme.zendesk.com`).',
    },
  ]
}

/**
 * Reduce what a customer typed to the bare subdomain: `acme`,
 * `acme.zendesk.com` and a pasted `https://acme.zendesk.com/agent/...` all
 * become `acme`. Rejects blanks and any host outside `zendesk.com`, because the
 * token exchange POSTs the client secret to this host. (A host-mapped help
 * centre such as `support.acme.com` is not an OAuth endpoint; the account's
 * `zendesk.com` subdomain still is.)
 */
export function normaliseSubdomain(raw: string | undefined | null): string {
  const s = (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
  if (!s) throw new Error('Zendesk subdomain is required (e.g. acme for acme.zendesk.com).')
  const sub = s.endsWith('.zendesk.com') ? s.slice(0, -'.zendesk.com'.length) : s
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sub)) {
    throw new Error('Zendesk subdomain must be a *.zendesk.com host.')
  }
  return sub
}

function resolveUrl(template: string, subdomain: string): string {
  return template.replace('{subdomain}', normaliseSubdomain(subdomain))
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  tenantSubdomain: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${resolveUrl(OAUTH_AUTHORIZE_URL_TEMPLATE, tenantSubdomain)}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  tenantSubdomain: string,
): Promise<Credentials> {
  // Normalised before anything is sent: a blank subdomain used to POST the
  // client secret to `https://.zendesk.com/oauth/tokens`.
  const subdomain = normaliseSubdomain(tenantSubdomain)
  const { data } = await axios.post<TokenResponse>(
    resolveUrl(OAUTH_TOKEN_URL_TEMPLATE, subdomain),
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      scope: 'read',
    },
    { headers: { 'Content-Type': 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    extra: { tenantSubdomain: subdomain },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Zendesk OAuth access tokens don't expire by default
  return credentials
}
