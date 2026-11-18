/**
 * ShipBob's OAuth2 flow, shared by every ShipBob adapter.
 *
 * Two verticals speak it — `logistics/shipbob` and
 * `inventory/shipbob-inventory` — against the same IdentityServer, the same
 * app registration and the same token endpoint. A vertical cannot import
 * another vertical (`tsconfig.<vertical>.json` references only
 * `tsconfig.kernel.json`, and a vertical-to-vertical reference would make the
 * project graph cyclic), so the flow lives here, in the kernel project every
 * vertical already references.
 *
 * What is here is only what ShipBob does differently from a stock OAuth2
 * provider, and each piece cost a debugging session to find:
 *
 *   - it REWRITES `response_type=code` into `code id_token` server-side, which
 *     defaults the response to a fragment the server never sees
 *   - it documents PKCE as required and refuses the authorize request outright
 *     without it
 *   - it runs two independent IdentityServer environments and an app exists in
 *     exactly one of them
 *
 * All three fail the same way: a redirect to `/home/error?errorId=…`, a page
 * that names no cause and looks identical for a bad redirect_uri, an unknown
 * scope, a staging client sent to production, and missing PKCE.
 *
 * What is NOT here: scopes and the API base an adapter reads. Those differ per
 * adapter — logistics needs `orders_*`, inventory does not — so each passes its
 * own. The caller resolves `scopes` before calling; an empty list omits the
 * parameter rather than sending `scope=`.
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

// ── Endpoints ───────────────────────────────────────────────────────────────
//
// ShipBob runs TWO independent IdentityServer environments, and an app exists
// in exactly one of them. A production client is unknown to staging and vice
// versa. Measured against the same client_id, redirect_uri and scope:
//   auth.shipbob.com       302 -> /home/error     (rejected)
//   authstage.shipbob.com  302 -> /Account/Login  (accepted)
// So the environment is not cosmetic: pointing at the wrong one is
// indistinguishable from every other misconfiguration.
export const SHIPBOB_AUTH_URL = 'https://auth.shipbob.com/connect/authorize'
export const SHIPBOB_TOKEN_URL = 'https://auth.shipbob.com/connect/token'
export const SHIPBOB_SANDBOX_AUTH_URL = 'https://authstage.shipbob.com/connect/authorize'
export const SHIPBOB_SANDBOX_TOKEN_URL = 'https://authstage.shipbob.com/connect/token'

/** Trailing slash: `resolveChannel` appends a bare path to it. */
export const SHIPBOB_API_BASE = 'https://api.shipbob.com/2026-01/'
export const SHIPBOB_SANDBOX_API_BASE = 'https://sandbox-api.shipbob.com/2026-01/'

/**
 * The name ShipBob knows this application by, used to pick our channel out of
 * `GET /channel`. ShipBob mints one channel per authorized application and the
 * response does not say which one belongs to the calling token, so the app's
 * own name is the only discriminator. Override via adapter config if the app
 * registration is renamed or a fork registers under its own name.
 */
export const DEFAULT_APP_NAME = 'Open Steward'

/** Every scope ShipBob publishes. A scope outside this set is refused by the
 *  same unexplained error page as a missing `code_challenge`. */
export const DOCUMENTED_SCOPES: readonly string[] = [
  'billing_read',
  'channels_read',
  'fulfillments_read',
  'fulfillments_write',
  'inventory_read',
  'inventory_write',
  'locations_read',
  'locations_write',
  'orders_read',
  'orders_write',
  'pricing_read',
  'products_read',
  'products_write',
  'receiving_read',
  'receiving_write',
  'returns_read',
  'returns_write',
  'webhooks_read',
  'webhooks_write',
  'offline_access',
]

export interface ShipBobOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  /** Resolved by the CALLER — this module applies no default set. */
  scopes?: string[]
  /** Use ShipBob's staging environment. An app lives in production OR staging,
   *  never both, and the wrong one fails with an unexplained error page. */
  sandbox?: boolean
  /** The name ShipBob knows this application by; see `resolveChannel`. */
  appName?: string
  /**
   * Look up the channel this grant belongs to at exchange time.
   *
   * Opt-in, because it is only worth a request for an adapter that SENDS the
   * `shipbob_channel_id` header. `inventory/shipbob-inventory` deliberately
   * never does — on a read the header filters the response to the one channel
   * our application created, which cost `logistics/shipbob` every order on a
   * real account — so for that adapter the lookup would spend a request
   * on a value nothing reads and park an id in `extra` implying a scoping it
   * does not do.
   */
  resolveChannel?: boolean
}

function authUrlFor(config: ShipBobOAuthConfig): string {
  return config.sandbox ? SHIPBOB_SANDBOX_AUTH_URL : SHIPBOB_AUTH_URL
}

function apiBaseFor(config: ShipBobOAuthConfig): string {
  return config.sandbox ? SHIPBOB_SANDBOX_API_BASE : SHIPBOB_API_BASE
}

function tokenUrlFor(config: ShipBobOAuthConfig): string {
  // Must match the environment that issued the code — a production token
  // endpoint does not know a staging authorization code.
  return config.sandbox ? SHIPBOB_SANDBOX_TOKEN_URL : SHIPBOB_TOKEN_URL
}

/**
 * Build the ShipBob OAuth2 authorization URL.
 */
export function buildAuthUrl(
  config: ShipBobOAuthConfig,
  state: string,
  codeChallenge?: string,
): string {
  const scopes = config.scopes ?? []
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri ?? '',
    state,
  })
  // Omitted rather than sent empty: `scope=` is a request for no scopes, which
  // ShipBob refuses with the same page as an unknown one.
  if (scopes.length > 0) params.set('scope', scopes.join(' '))
  // ShipBob REWRITES `response_type=code` into `code id_token` server-side —
  // measured, not assumed: every authorize probe comes back with
  // `response_type=code id_token` and an injected `nonce` regardless of what
  // was sent. A hybrid response defaults to `response_mode=fragment`, and a
  // fragment never reaches the server, so the callback fired with no `code`
  // and no `state`:
  //
  //   /auth/<vertical>/<platform>/callback#code=…&id_token=…&state=…
  //
  // `response_mode=query` is ignored (hybrid responses may not use it — tokens
  // would land in server logs). `form_post` IS honoured, and POSTs the same
  // fields as a form body, which the shared callback accepts.
  params.set('response_mode', 'form_post')
  // ShipBob documents both as REQUIRED. Omitting them is why the authorize
  // request was refused with `/home/error?errorId=…` rather than a consent
  // screen — IdentityServer rejects it before the redirect_uri is ever used,
  // so there is no callback carrying an `error=` to read.
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }
  return `${authUrlFor(config)}?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  config: ShipBobOAuthConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<Credentials> {
  const { data } = await axios.post(
    tokenUrlFor(config),
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      // The verifier must match the challenge sent to /connect/authorize, or
      // the exchange fails even though the code itself is valid.
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  const credentials: Credentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope ?? undefined,
  }

  if (!config.resolveChannel) return credentials
  const channel = await resolveChannel(config, credentials.accessToken)
  if (Object.keys(channel).length === 0) return credentials
  return { ...credentials, extra: { ...(credentials.extra ?? {}), ...channel } }
}

interface ShipBobChannel {
  id: number
  name?: string | null
  application_name?: string | null
}

/**
 * Work out which channel this grant belongs to, for the `shipbob_channel_id`
 * header an adapter that scopes by channel sends.
 *
 * This cannot be an `oauthFields()` input: those are collected BEFORE the
 * authorize redirect, and the channel does not exist until the merchant
 * authorizes the app. ShipBob mints one channel per authorized application,
 * and `GET /channel` returns every channel on the account with no marker for
 * which one issued the token — so the application name is the discriminator.
 *
 * Non-fatal by design. A connection that cannot name its channel still reads
 * perfectly well, which is what every ShipBob connection did before this
 * existed; only channel-scoped writes and `order:estimate` need the header.
 * Failing the connect would turn a working read-only setup into no setup.
 */
async function resolveChannel(
  config: ShipBobOAuthConfig,
  accessToken: string,
): Promise<Record<string, unknown>> {
  let items: ShipBobChannel[]
  try {
    const { data } = await axios.get(`${apiBaseFor(config)}channel`, {
      headers: { Authorization: authHeader(accessToken), Accept: 'application/json' },
      // One page. A stock account has four rows, one per authorized
      // application, and 250 is the documented maximum.
      params: { RecordsPerPage: 250 },
    })
    items = (data?.items ?? []) as ShipBobChannel[]
  } catch {
    // The grant itself is good — only the channel is unknown. Throwing here
    // would discard a working token over a secondary lookup.
    return {}
  }

  const appName = config.appName ?? DEFAULT_APP_NAME
  const mine = items.filter((c) => c.application_name === appName)
  if (mine.length === 1) return { channelId: String(mine[0]!.id) }

  // Zero matches, or more than one. Picking the first would route writes to
  // whichever channel ShipBob happened to list first, which is a silent wrong
  // answer; recording the candidates makes the ambiguity visible instead.
  return {
    channelCandidates: items.map((c) => ({
      id: String(c.id),
      name: c.name ?? undefined,
      applicationName: c.application_name ?? undefined,
    })),
  }
}

/**
 * Refresh an expired access token.
 *
 * Returns the credentials UNTOUCHED when they carry no refresh token. That is
 * the Personal Access Token case: a PAT does not expire on a schedule, there
 * is nothing to exchange, and posting anyway would 400 against a credential
 * that still works.
 */
export async function refreshCredentials(
  config: ShipBobOAuthConfig,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    return credentials
  }

  const { data } = await axios.post(
    tokenUrlFor(config),
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

  return {
    // Everything the blob already carried — `extra` (the channelId a
    // channel-scoped client turns into the `shipbob_channel_id` header),
    // `webhookSecret`, `tenantId`. The refresh return value REPLACES the
    // stored credentials wholesale (`refreshWithRotationGuard` ->
    // `store.updateById`), so a field missing here is a field deleted from the
    // database.
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope ?? credentials.scope,
  }
}

/**
 * Build the Authorization header value for ShipBob requests.
 * Works for both PAT tokens and OAuth2 access tokens.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
