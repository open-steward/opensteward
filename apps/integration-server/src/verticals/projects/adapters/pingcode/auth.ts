/**
 * PingCode OAuth2 client-credentials auth.
 *
 * PingCode is not an interactive-OAuth platform: the customer registers a
 * "Custom application" in their PingCode admin console and copies the
 * `client_id` + `client_secret`. We mint a short-lived enterprise access
 * token from those via:
 *
 *   GET /v1/auth/token?grant_type=client_credentials&client_id=…&client_secret=…
 *   → { access_token, token_type: "bearer", expires_in }
 *
 * The token expires (≈2h), so we keep `clientId`/`clientSecret` on
 * `Credentials.extra` and re-mint in `refreshCredentials` (there is no
 * refresh_token grant for client-credentials).
 *
 * Auth model: `oauth2_cc` (Connect Link form — no redirect).
 *
 * Docs: https://open.pingcode.com/
 */
import type { Credentials } from '@opensteward/shared'
import { API_BASE_URL, OAUTH_TOKEN_PATH } from './constants'

/** Long-lived fields carried on `Credentials.extra` so the bearer can be
 *  re-minted without re-prompting the customer. */
export interface PingcodeExtra {
  clientId: string
  clientSecret: string
}

export interface PingcodeTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export function extraFrom(credentials: Credentials): PingcodeExtra {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return {
    clientId: String(extra.clientId ?? ''),
    clientSecret: String(extra.clientSecret ?? ''),
  }
}

/**
 * Exchange a `client_credentials` grant for an enterprise access token.
 * Exposed as a seam (`fetchImpl`) so the mint can be unit-tested.
 */
export async function mintToken(
  extra: PingcodeExtra,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PingcodeTokenResponse> {
  const url = new URL(`${API_BASE_URL}${OAUTH_TOKEN_PATH}`)
  url.searchParams.set('grant_type', 'client_credentials')
  url.searchParams.set('client_id', extra.clientId)
  url.searchParams.set('client_secret', extra.clientSecret)

  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PingCode token endpoint returned ${res.status}: ${text}`)
  }
  return (await res.json()) as PingcodeTokenResponse
}

/** Build canonical `Credentials` from a minted token + the long-lived extra. */
export function credentialsFromToken(
  token: PingcodeTokenResponse,
  extra: PingcodeExtra,
): Credentials {
  const expiresAt =
    typeof token.expires_in === 'number'
      ? new Date(Date.now() + token.expires_in * 1000)
      : undefined
  return {
    accessToken: token.access_token,
    expiresAt,
    scope: token.scope,
    extra: { clientId: extra.clientId, clientSecret: extra.clientSecret },
  }
}

/**
 * Validate the Connect Link form, mint the first bearer token, and return
 * canonical credentials.
 */
export async function buildCredentials(
  fields: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const clientId = (fields.clientId ?? '').trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!clientId) throw new Error('Client ID is required.')
  if (!clientSecret) throw new Error('Client secret is required.')

  const extra: PingcodeExtra = { clientId, clientSecret }
  const token = await mintToken(extra, fetchImpl)
  return credentialsFromToken(token, extra)
}

/** Re-mint the bearer token from the stored long-lived credentials. */
export async function refreshCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const extra = extraFrom(credentials)
  if (!extra.clientId || !extra.clientSecret) {
    // Nothing to refresh with — hand back what we have.
    return credentials
  }
  const token = await mintToken(extra, fetchImpl)
  return credentialsFromToken(token, extra)
}
