/**
 * Tipalti auth — OAuth2 client-credentials (OpenID Connect).
 *
 * Tipalti is not a redirect-OAuth integration for server-to-server use: the
 * payer mints a `clientId` + `clientSecret` pair under Administration → API
 * integration and chooses the environment (sandbox / production). Those are
 * exchanged at the hosted IdP token endpoint for a short-lived Bearer access
 * token used on every REST call.
 *
 * The originating clientId / clientSecret / environment are stashed on
 * `credentials.extra` so the token can be re-minted on `refreshCredentials`
 * without re-prompting the customer.
 *
 * Docs: https://documentation.tipalti.com/reference/authentication-and-authorization1
 */
import axios from 'axios'
import type { CredentialField, Credentials } from '@opensteward/shared'
import { DEFAULT_SCOPE, tokenUrl, type TipaltiEnvironment } from './constants'

export const TIPALTI_CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'clientId',
    label: 'Client ID',
    type: 'text',
    required: true,
    helpText: 'From Administration → API integration → OAuth applications.',
  },
  {
    name: 'clientSecret',
    label: 'Client secret',
    type: 'password',
    required: true,
    helpText: 'Generated alongside the client ID. Shown only once at creation.',
  },
  {
    name: 'environment',
    label: 'Environment',
    type: 'select',
    required: true,
    options: [
      { value: 'production', label: 'Production' },
      { value: 'sandbox', label: 'Sandbox' },
    ],
  },
]

interface TipaltiTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

function normaliseEnvironment(value: string | undefined): TipaltiEnvironment {
  return value === 'production' ? 'production' : 'sandbox'
}

async function mintToken(
  clientId: string,
  clientSecret: string,
  environment: TipaltiEnvironment,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: DEFAULT_SCOPE,
  })

  const { data } = await axios.post<TipaltiTokenResponse>(tokenUrl(environment), body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    expiresAt,
    scope: data.scope ?? DEFAULT_SCOPE,
    extra: { clientId, clientSecret, environment },
  }
}

export async function exchangeTipaltiCredentials(
  fields: Record<string, string>,
): Promise<Credentials> {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Client ID and client secret are required for Tipalti.')
  }
  const environment = normaliseEnvironment(fields.environment)
  return mintToken(clientId, clientSecret, environment)
}

export async function refreshTipaltiCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  const clientSecret = typeof extra.clientSecret === 'string' ? extra.clientSecret : ''
  if (!clientId || !clientSecret) {
    // No stored client credentials to re-mint with — hand back what we have.
    return credentials
  }
  const environment = normaliseEnvironment(
    typeof extra.environment === 'string' ? extra.environment : undefined,
  )
  return mintToken(clientId, clientSecret, environment)
}

export function environmentOf(credentials: Credentials): TipaltiEnvironment {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return normaliseEnvironment(typeof extra.environment === 'string' ? extra.environment : undefined)
}
