/**
 * Tyro Connect authentication: OAuth 2.0 client credentials.
 *
 * "Tyro Connect's authorisation server uses the OAuth 2.0 Client Credentials
 *  Flow to authenticate partner systems. App integrations always use this
 *  flow." and "these credentials contain two values: a `client_id` and
 *  `client_secret`."
 *  https://docs.connect.tyro.com/docs/getting-started/authentication/client-credentials.md
 *
 * Request fields (application/x-www-form-urlencoded): `client_id`,
 * `client_secret`, `grant_type` (Enum: "client_credentials"), `audience`
 * (Enum: "https://pos.connect.tyro", "https://app.connect.tyro").
 * Response: `access_token`, `expires_in`, `token_type`.
 *  https://docs.connect.tyro.com/specs/authentication/client-credentials/authentication/generate-token.md
 *
 * "Each JWT expires after 12 hours." and "If a partner requests more than 12
 *  tokens within an 11-hour period the authorisation server will reject the
 *  requests. Please make sure you cache your tokens and only request a token
 *  when it is about to expire." The limit is per partner (one client_id serves
 *  every merchant), so tokens are cached per client_id/client_secret in the
 *  process and shared by every connection that holds those credentials. A
 *  token is reused until it is within TOKEN_REUSE_MARGIN_MS of expiry.
 *
 * The connection also carries the merchant id (`mid`) every Reporting path
 * takes, and the currency its amounts are in (see transform/charge.ts).
 */
import { createHash } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'
import { APP_AUDIENCE, TOKEN_URL } from './constants'

export interface TyroTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

/** Long-lived connection values kept on `Credentials.extra`. */
export interface TyroExtra {
  clientId: string
  clientSecret: string
  mid?: string
  currency?: string
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

export function extraFrom(credentials: Credentials): TyroExtra {
  const extra = (credentials.extra as Record<string, unknown> | undefined) ?? {}
  return {
    clientId: str(extra['clientId']) ?? '',
    clientSecret: str(extra['clientSecret']) ?? '',
    mid: str(extra['mid']),
    currency: str(extra['currency']),
  }
}

/** A cached token is reused only while it has more than this long left. */
export const TOKEN_REUSE_MARGIN_MS = 30 * 60 * 1000

interface MintedToken {
  token: TyroTokenResponse
  /** Absent when the mint returned no expires_in; such a token is not cached. */
  expiresAtMs?: number
}

const tokenCache = new Map<string, MintedToken & { expiresAtMs: number }>()
const inflight = new Map<string, Promise<MintedToken>>()

function cacheKey(clientId: string, clientSecret: string): string {
  return createHash('sha256').update(`${clientId}\0${clientSecret}`).digest('hex')
}

/** Test hook: forget every cached token. */
export function _resetTyroTokenCache(): void {
  tokenCache.clear()
  inflight.clear()
}

/**
 * A token for these client credentials: the cached one while it is not about
 * to expire, else a newly minted one (concurrent callers share one mint).
 */
export async function getToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<MintedToken> {
  const key = cacheKey(clientId, clientSecret)
  const hit = tokenCache.get(key)
  if (hit && hit.expiresAtMs - Date.now() > TOKEN_REUSE_MARGIN_MS) return hit
  let pending = inflight.get(key)
  if (!pending) {
    pending = mintToken(clientId, clientSecret, fetchImpl).then((token) => {
      if (typeof token.expires_in !== 'number') return { token }
      const entry = { token, expiresAtMs: Date.now() + token.expires_in * 1000 }
      tokenCache.set(key, entry)
      return entry
    })
    inflight.set(key, pending)
    pending.then(
      () => inflight.delete(key),
      () => inflight.delete(key),
    )
  }
  return pending
}

export async function mintToken(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<TyroTokenResponse> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    audience: APP_AUDIENCE,
  })
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(new Error(`Tyro token endpoint returned ${res.status}: ${text}`), {
      statusCode: res.status,
    })
  }
  const data = (await res.json()) as TyroTokenResponse
  if (typeof data.access_token !== 'string' || data.access_token === '') {
    throw new Error('Tyro token endpoint returned no access_token')
  }
  return data
}

function credentialsFrom(got: MintedToken, extra: TyroExtra): Credentials {
  return {
    accessToken: got.token.access_token,
    expiresAt: got.expiresAtMs !== undefined ? new Date(got.expiresAtMs) : undefined,
    extra: {
      clientId: extra.clientId,
      clientSecret: extra.clientSecret,
      ...(extra.mid ? { mid: extra.mid } : {}),
      ...(extra.currency ? { currency: extra.currency } : {}),
    },
  }
}

/** Validate the Connect Link form, mint the first token, return credentials. */
export async function buildCredentials(
  fields: Record<string, string>,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const clientId = str(fields['clientId'])
  const clientSecret = str(fields['clientSecret'])
  if (!clientId) throw new Error('Tyro Connect client_id is required.')
  if (!clientSecret) throw new Error('Tyro Connect client_secret is required.')
  const extra: TyroExtra = {
    clientId,
    clientSecret,
    mid: str(fields['mid']),
    currency: str(fields['currency'])?.toUpperCase(),
  }
  return credentialsFrom(await getToken(clientId, clientSecret, fetchImpl), extra)
}

/** Re-mint the JWT from the stored client credentials. */
export async function refreshCredentials(
  credentials: Credentials,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Credentials> {
  const extra = extraFrom(credentials)
  if (!extra.clientId || !extra.clientSecret) {
    throw new Error('Tyro connection has no stored client_id/client_secret; reconnect it.')
  }
  return credentialsFrom(await getToken(extra.clientId, extra.clientSecret, fetchImpl), extra)
}
