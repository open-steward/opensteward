/**
 * cobra CRM Cloud authentication.
 *
 * "Use the client credentials grant flow to exchange your email and api key
 * for a Bearer Token. Make a request to the token endpoint with the following
 * parameters: POST /auth/token { "username": "your@email.de", "password":
 * "your_api_key" }" ... "Token lifetime is one hour."
 * (https://apis.cobra-hilfe.de/doc-386341.md)
 *
 * The endpoint's OpenAPI (https://apis.cobra-hilfe.de/api-5487706.md) takes a
 * `TokenRequest` (`username`, `password`), requires the X-Integration-Name,
 * X-Integration-Provider and X-Cobra-TenantId headers, and answers a
 * `TokenResponseCobraApiResponse` whose `data.bearerToken` is the token.
 *
 * The token lasts an hour and there is no refresh token, so the email, API key
 * and tenant id are kept on `credentials.extra` and the grant is re-run on
 * refresh.
 */
import type { CredentialField, Credentials } from '@opensteward/shared'
import { BASE_URL, TOKEN_LIFETIME_MS } from './constants'
import { integrationHeaders, type CobraApiResponse } from './client'

export const COBRA_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'email',
    label: 'API user email',
    type: 'text',
    placeholder: 'api-user@example.com',
    helpText: 'The email of the cobra API user; sent as `username` to POST /auth/token.',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key',
    type: 'password',
    helpText: "The API user's api key; sent as `password` to POST /auth/token.",
    required: true,
  },
  {
    name: 'cobraTenantId',
    label: 'Tenant ID',
    type: 'text',
    placeholder: '12e39e53-ece1-4d8d-8958-e782de1dbef0',
    helpText: 'Your cobra Tenant GUID, sent as the X-Cobra-TenantId header on every request.',
    required: true,
  },
]

interface TokenResponse {
  bearerToken?: string | null
}

function field(input: Record<string, unknown> | undefined, name: string): string {
  const value = input?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

async function requestToken(email: string, apiKey: string, tenantId: string): Promise<Credentials> {
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      ...integrationHeaders(tenantId),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ username: email, password: apiKey }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw Object.assign(new Error(`cobra CRM token request failed (${res.status}): ${text}`), {
      statusCode: res.status,
    })
  }
  const json = (await res.json()) as CobraApiResponse<TokenResponse>
  const token = json.data?.bearerToken
  if (typeof token !== 'string' || token === '') {
    throw new Error('cobra CRM token response carried no data.bearerToken')
  }
  return {
    accessToken: token,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
    extra: { email, apiKey, cobraTenantId: tenantId },
  }
}

/** Connect Link exchange: email + API key + tenant id → bearer token. */
export async function exchangeCobraCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const email = field(fields, 'email')
  const apiKey = field(fields, 'apiKey')
  const tenantId = field(fields, 'cobraTenantId')
  if (!email || !apiKey || !tenantId) {
    throw new Error('cobra CRM: API user email, API key and tenant ID are all required.')
  }
  return requestToken(email, apiKey, tenantId)
}

/** Re-run the grant: cobra issues no refresh token. */
export async function refreshCobraCredentials(credentials: Credentials): Promise<Credentials> {
  const email = field(credentials.extra, 'email')
  const apiKey = field(credentials.extra, 'apiKey')
  const tenantId = field(credentials.extra, 'cobraTenantId')
  if (!email || !apiKey || !tenantId) {
    throw Object.assign(
      new Error(
        'cobra CRM: this connection predates the email/API-key/tenant login and cannot renew its token; reconnect it.',
      ),
      { statusCode: 401 },
    )
  }
  return requestToken(email, apiKey, tenantId)
}
