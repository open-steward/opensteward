import type { CredentialField, Credentials } from '@opensteward/shared'
import { oauthTokenUrl, TOKEN_HELP_URL } from './constants'

/**
 * Birdview PSA authentication: OAuth 2.0 client-credentials grant, per tenant.
 *
 * "How to use the Birdview API with Swagger and Postman"
 * (https://help.birdviewpsa.com/hc/en-us/articles/38116720932749):
 *   "POST [host]/OAuth2/token
 *    Content-Type: application/x-www-form-urlencoded
 *    grant_type=client_credentials&client_id=[clientID]&scope=user:[user]&client_secret=[clientSecret]
 *    ... [user] with the target user ID (not email)"
 *   "include [the access token] in the Authorization header for subsequent API
 *    requests: Authorization: Bearer <access_token>"
 *
 * "OAuth clients 2.0" (https://help.birdviewpsa.com/hc/en-us/articles/9155019022605):
 *   "when sending a request to OAuth to get a token, you must specify the
 *    parameter scope with the ID of the user on whose behalf your application
 *    will act."
 *
 * So the form collects the account slug, the OAuth client id and secret, and
 * the Birdview user id the connection acts as; all four are kept on
 * `credentials.extra` so the grant can be re-run when the token expires.
 */

/** Connect Link has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth authorization-code path is unused for Birdview PSA; the
 * Connect Link flow calls `exchangeCredentials` instead.
 */
export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error(
    'Birdview PSA uses the Connect Link credential form, not an OAuth authorization-code exchange.',
  )
}

export const CREDENTIAL_FIELDS: CredentialField[] = [
  { name: 'clientId', label: 'Client ID', type: 'text', required: true },
  { name: 'clientSecret', label: 'Client secret', type: 'password', required: true },
  {
    name: 'account',
    label: 'Account slug',
    type: 'text',
    required: true,
    placeholder: 'acme',
    helpText: `Your Birdview PSA subdomain. For https://acme.go.easyprojects.net the slug is "acme". The OAuth client must have "Allow client credentials grant authorization" enabled. See ${TOKEN_HELP_URL}`,
  },
  {
    name: 'userId',
    label: 'Birdview user ID',
    type: 'text',
    required: true,
    placeholder: '7',
    helpText:
      "The numeric ID (not email) of the Birdview user the connection acts as, sent as scope=user:<id>. It is shown in the URL of that user's details on the Users page.",
  },
]

interface GrantInput {
  account: string
  clientId: string
  clientSecret: string
  userId: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

/** Run the documented client-credentials grant for one user. */
async function grant(input: GrantInput): Promise<Credentials> {
  const tokenUrl = oauthTokenUrl(input.account)
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: input.clientId,
    scope: `user:${input.userId}`,
    client_secret: input.clientSecret,
  })
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Birdview PSA token request failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as Partial<TokenResponse>
  if (typeof json.access_token !== 'string' || json.access_token === '') {
    throw new Error('Birdview PSA token response has no access_token.')
  }
  const expiresAt =
    typeof json.expires_in === 'number' ? new Date(Date.now() + json.expires_in * 1000) : undefined
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scope: json.scope,
    extra: { ...input },
  }
}

/** Connect Link: exchange the submitted form for a token. */
export async function exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
  const input: GrantInput = {
    account: (fields['account'] ?? '').trim(),
    clientId: (fields['clientId'] ?? '').trim(),
    clientSecret: fields['clientSecret'] ?? '',
    userId: (fields['userId'] ?? '').trim(),
  }
  for (const f of CREDENTIAL_FIELDS) {
    if (!input[f.name as keyof GrantInput]) throw new Error(`${f.label} is required.`)
  }
  if (!/^\d+$/.test(input.userId)) {
    throw new Error('Birdview user ID must be the numeric user ID (not an email).')
  }
  return grant(input)
}

/** Re-run the client-credentials grant from the stored form values. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const str = (k: string): string => (typeof extra[k] === 'string' ? (extra[k] as string) : '')
  const input: GrantInput = {
    account: str('account'),
    clientId: str('clientId'),
    clientSecret: str('clientSecret'),
    userId: str('userId'),
  }
  if (!input.account || !input.clientId || !input.clientSecret || !input.userId) {
    // A connection made before the user id was collected cannot re-run the
    // documented grant; it must reconnect.
    return credentials
  }
  return grant(input)
}
