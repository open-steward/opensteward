/**
 * Tilaka Sign+ auth — client-credentials grant.
 *
 * Tilaka authenticates server-to-server callers with a client-credentials
 * grant: `POST {host}/auth` with `client_id` + `client_secret` +
 * `grant_type=client_credentials` (form-urlencoded) returns an
 * `access_token` used as a `Bearer` token on every Sign+ call. There is no
 * OAuth Authorization-Code flow, so the Connect Link credential form
 * collects the client id + secret (plus the environment, which selects the
 * API host) and runs the grant at exchange time.
 *
 * We use the shared `customForm` template rather than `oauth2ClientCredentials`
 * because the token endpoint host is environment-dependent and the SAME host
 * also serves the signing API — we store the resolved `baseUrl` (and the
 * client id/secret) on `credentials.extra` so the client can reuse the host
 * and `refreshCredentials` can re-run the grant without re-prompting.
 *
 * Product: https://tilaka.id/features/
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { customForm } from '@opensteward/shared'
import { AUTH_PATH, ENVIRONMENT_BASE_URLS, PROD_BASE_URL } from './constants'

interface TilakaTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

async function clientCredentialsGrant(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<TilakaTokenResponse> {
  const { data } = await axios.post<TilakaTokenResponse>(
    `${baseUrl}${AUTH_PATH}`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return data
}

export const FORM = customForm({
  fields: [
    {
      name: 'clientId',
      label: 'Tilaka client ID',
      type: 'text',
      placeholder: 'Your Tilaka Sign+ client_id',
      helpText:
        'Issued by Tilaka when your organization is provisioned for the Sign+ managed API. The adapter exchanges it (with the client secret) for a Bearer token via POST /auth.',
      required: true,
    },
    {
      name: 'clientSecret',
      label: 'Tilaka client secret',
      type: 'password',
      placeholder: 'Your Tilaka Sign+ client_secret',
      helpText: 'Paired with the client ID for the client-credentials grant.',
      required: true,
    },
    {
      name: 'environment',
      label: 'Environment',
      type: 'select',
      helpText: 'Match the environment your Tilaka Sign+ account is provisioned in.',
      required: true,
      options: [
        { value: 'production', label: 'Production (api.tilaka.id)' },
        { value: 'sandbox', label: 'Sandbox (sb-api.tilaka.id)' },
      ],
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientId = (fields.clientId ?? '').trim()
    const clientSecret = fields.clientSecret ?? ''
    if (!clientId || !clientSecret) {
      throw new Error('Tilaka client ID and client secret are required.')
    }
    const environment = (fields.environment ?? 'production').trim().toLowerCase()
    const baseUrl = ENVIRONMENT_BASE_URLS[environment] ?? PROD_BASE_URL

    const token = await clientCredentialsGrant(baseUrl, clientId, clientSecret)
    const expiresAt =
      typeof token.expires_in === 'number'
        ? new Date(Date.now() + token.expires_in * 1000)
        : undefined

    return {
      accessToken: token.access_token,
      expiresAt,
      extra: { environment, baseUrl, clientId, clientSecret },
    }
  },
})

/**
 * Re-run the client-credentials grant using the client id/secret stashed on
 * `credentials.extra` at exchange time. Returns the credentials unchanged if
 * those are unavailable (nothing to refresh with).
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = credentials.extra ?? {}
  const baseUrl = String(extra['baseUrl'] ?? PROD_BASE_URL)
  const clientId = typeof extra['clientId'] === 'string' ? extra['clientId'] : undefined
  const clientSecret = typeof extra['clientSecret'] === 'string' ? extra['clientSecret'] : undefined
  if (!clientId || !clientSecret) return credentials

  const token = await clientCredentialsGrant(baseUrl, clientId, clientSecret)
  const expiresAt =
    typeof token.expires_in === 'number'
      ? new Date(Date.now() + token.expires_in * 1000)
      : undefined

  return {
    accessToken: token.access_token,
    expiresAt,
    extra,
  }
}
