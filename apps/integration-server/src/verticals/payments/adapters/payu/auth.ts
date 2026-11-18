/**
 * PayU authenticates REST calls with a short-lived OAuth bearer token minted
 * from a `client_credentials` grant (POST to `/pl/standard/user/oauth/authorize`
 * with `grant_type=client_credentials`, `client_id`, `client_secret`). The
 * token is valid ~12h, so we mint it during the Connect exchange and re-mint
 * it in `refreshCredentials`.
 *
 * We store the minted bearer as `accessToken` and keep the long-lived
 * credentials needed to re-mint — `clientId`, `clientSecret`, `merchantPosId`,
 * the second/MD5 key (webhook signing), and the chosen `environment` — on
 * `Credentials.extra`.
 *
 * Auth model: `api_key` (the customer pastes their POS key pair into the
 * Connect Link form; there is no interactive OAuth redirect).
 *
 * Docs: https://developers.payu.com/europe/docs/payment-flows/auth-and-order/
 */
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_ENVIRONMENT,
  HOSTS,
  OAUTH_TOKEN_PATH,
  type PayuEnvironment,
} from './constants'

export interface PayuTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  grant_type?: string
}

/** Long-lived fields carried on `Credentials.extra` so the bearer can be
 *  re-minted without re-prompting the merchant. */
export interface PayuExtra {
  clientId: string
  clientSecret: string
  merchantPosId: string
  secondKey?: string
  environment: PayuEnvironment
}

function pickEnvironment(value: string | undefined): PayuEnvironment {
  return value && value in HOSTS ? (value as PayuEnvironment) : DEFAULT_ENVIRONMENT
}

export function extraFrom(credentials: Credentials): PayuExtra {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return {
    clientId: String(extra.clientId ?? ''),
    clientSecret: String(extra.clientSecret ?? ''),
    merchantPosId: String(extra.merchantPosId ?? ''),
    secondKey: extra.secondKey != null ? String(extra.secondKey) : undefined,
    environment: pickEnvironment(extra.environment as string | undefined),
  }
}

/**
 * Exchange a `client_credentials` grant for a bearer token.
 * Exposed as a seam (`fetchImpl`) so the token mint can be unit-tested.
 */
export async function mintToken(
  extra: PayuExtra,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PayuTokenResponse> {
  const host = HOSTS[extra.environment] ?? HOSTS[DEFAULT_ENVIRONMENT]
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: extra.clientId,
    client_secret: extra.clientSecret,
  })
  const res = await fetchImpl(`${host}${OAUTH_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PayU token endpoint returned ${res.status}: ${text}`)
  }
  return (await res.json()) as PayuTokenResponse
}

/** Build canonical `Credentials` from a minted token + the long-lived extra. */
export function credentialsFromToken(token: PayuTokenResponse, extra: PayuExtra): Credentials {
  const expiresAt =
    typeof token.expires_in === 'number'
      ? new Date(Date.now() + token.expires_in * 1000)
      : undefined
  return {
    accessToken: token.access_token,
    expiresAt,
    extra: {
      clientId: extra.clientId,
      clientSecret: extra.clientSecret,
      merchantPosId: extra.merchantPosId,
      ...(extra.secondKey ? { secondKey: extra.secondKey } : {}),
      environment: extra.environment,
    },
  }
}

/**
 * Validate the Connect Link form, mint the first bearer token, and return
 * canonical credentials. `clientId` is the POS OAuth client id (the numeric
 * `merchantPosId` doubles as the client id on PayU, but we keep them distinct
 * to allow private OAuth clients).
 */
export async function buildCredentials(
  fields: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const merchantPosId = (fields.merchantPosId ?? '').trim()
  const clientId = (fields.clientId ?? merchantPosId).trim()
  const clientSecret = (fields.clientSecret ?? '').trim()
  if (!merchantPosId) throw new Error('Merchant POS ID (pos_id) is required.')
  if (!clientId) throw new Error('OAuth client ID is required.')
  if (!clientSecret) throw new Error('OAuth client secret is required.')

  const extra: PayuExtra = {
    clientId,
    clientSecret,
    merchantPosId,
    secondKey: (fields.secondKey ?? '').trim() || undefined,
    environment: pickEnvironment(fields.environment),
  }
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
