/**
 * Zoho Desk webhook handling: verified through the documented `X-ZDesk-JWT`,
 * with the body treated as an unauthenticated hint.
 *
 * Source (fetched 2026-09-28): https://desk.zoho.com/support/WebhookDocument.do
 * section "Verifying the authenticity of event information using JWT":
 *
 *   "You can find the information in the X-ZDesk-JWT header that is included
 *    in the payload."  "X-ZDesk-JWT: <Header>.<Claims>.<Signature>"
 *   Header: "alg" : "RS256", "typ" : "JWT", "kid" : ID of key used to sign
 *   Claims: "iss" : issuer - Organization ID in the format "orgId:2389290"
 *           "aud" : audience - Webhook in the format "webhookId:1234567891011"
 *           "exp" : Time of token expiry, expressed in UTC and milliseconds
 *           "iat" : Time of token creation, expressed in UTC and milliseconds
 *   "Signature is created using Header and Claims."
 *   "The JWT is signed using the RSA-SHA256 algorithm."
 *   "JWT public keys URL https://desk.zoho.com/.well-known/jwks.json"
 *   "In case if there is a discrepancy between the keys stored in the file and
 *    those in the response, it becomes necessary to fetch new keys from the
 *    URL provided."
 *   The sample claims are `"exp": 1692280327, "iat": 1692280148` (seconds),
 *   and the sample Java verifier pins issuer "orgId:2389290" and audience
 *   "webhookId:1234567891011" and requires iss, aud and exp.
 *
 * What is checked, in order (any failure → no connection → 401):
 *   1. The header is exactly three non-empty base64url segments. The JOSE
 *      header's `alg` is exactly "RS256" (so "none" and every HS* are refused),
 *      `kid` is a non-empty string, `typ` is absent or "JWT", and `crit` is
 *      absent. Nothing in the token chooses where keys come from (`jku`, `x5u`
 *      and `jwk` are never read).
 *   2. `exp` and `iat` are positive integers in seconds or milliseconds (see
 *      {@link claimTimeMs}), `exp` has not passed and `iat` is not in the
 *      future, each within {@link DEFAULT_CLOCK_SKEW_MS}, and `iat <= exp`.
 *   3. `iss` is "orgId:<id>" and `aud` is "webhookId:<id>" (or an array of
 *      those). Exactly one candidate connection must have that orgId in
 *      `credentials.extra.orgId` (written at connect time by auth.ts) AND that
 *      webhookId stored for it (see {@link candidateWebhookIds}). No stored
 *      webhookId means no match: every Zoho Desk org's tokens verify under
 *      the same key set, so an unpinned `aud` would accept tokens minted for
 *      another subscriber of the same org.
 *   4. The signature over `<header>.<claims>` verifies with RSA-SHA256 under
 *      the key whose `kid` matches, taken only from the JWKS of a host in
 *      {@link ZOHO_DESK_DATA_CENTRES} (see {@link jwksUrlsFor}).
 *
 * The body is NOT authenticated. The JWT covers header and claims only, so
 * anyone holding a still-valid header could pair it with other bytes. Events
 * are therefore emitted without the body (`payload: { bodyVerified: false }`),
 * routed only to the connection the JWT names, and the handler reports
 * `bodyAuthenticated: false` so the consumer never deletes a cached row on the
 * strength of the body. Consumers re-read the resource through the API.
 *
 * The body's `orgId` field is written by the sender and is not used for
 * anything here.
 */
import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto'
import type {
  WebhookContextVerification,
  WebhookHandler,
  WebhookVerificationCandidate,
} from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'
import { ZOHO_DESK_DATA_CENTRES, normaliseDataCentre } from './constants'

/**
 * The synchronous verifier stays closed. A `secret` string cannot carry the
 * connection's orgId, webhookId and data centre, and the public keys have to
 * be fetched, so any caller that does not use `verifyWebhookWithContext`
 * rejects every delivery.
 */
export function verifyZohoDeskWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

// ── JWT verification ─────────────────────────────────────────────────────────

/** The only JWKS URL the Zoho page names. */
export const DOCUMENTED_JWKS_URL = 'https://desk.zoho.com/.well-known/jwks.json'

export const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000
/** Minimum gap between two fetches of one JWKS URL outside the TTL refresh. */
export const DEFAULT_REFETCH_COOLDOWN_MS = 30 * 1000
export const DEFAULT_FETCH_TIMEOUT_MS = 5 * 1000
export const DEFAULT_CLOCK_SKEW_MS = 60 * 1000
const MAX_JWT_LENGTH = 8 * 1024
const MAX_JWKS_BYTES = 64 * 1024
const MIN_RSA_BITS = 2048

/**
 * The JWKS URLs tried for a connection, in order: its own data centre's Desk
 * host, then the documented US URL.
 *
 * The page names only https://desk.zoho.com/.well-known/jwks.json. On
 * 2026-09-28 every Desk host in {@link ZOHO_DESK_DATA_CENTRES} (us, eu, in,
 * au, jp, ca, sa, sg, ae) answered `/.well-known/jwks.json` with its own,
 * different set of two RS256 keys, so an org hosted outside the US is most
 * likely signed under its own data centre's keys. That is an observation, not
 * documentation, so the documented URL stays as the fallback. Both come from
 * the fixed table; nothing from the token or the body becomes a URL.
 */
export function jwksUrlsFor(dataCentre: string): string[] {
  const own = `${ZOHO_DESK_DATA_CENTRES[normaliseDataCentre(dataCentre)]!.deskUrl}/.well-known/jwks.json`
  return own === DOCUMENTED_JWKS_URL ? [own] : [own, DOCUMENTED_JWKS_URL]
}

/**
 * `exp` / `iat` in ms. The claim list says "UTC and milliseconds" but the
 * sample is in seconds, so both are accepted. They cannot be confused: 1e11
 * seconds is the year 5138 and 1e11 milliseconds is March 1973, so a value at
 * or above 1e11 is milliseconds and anything below is seconds.
 */
export function claimTimeMs(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) return null
  return v >= 1e11 ? v : v * 1000
}

const B64URL = /^[A-Za-z0-9_-]+$/

function decodeJsonSegment(seg: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const direct = headers[name]
  if (direct !== undefined) return direct
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === name) return v
  return undefined
}

interface ParsedJwt {
  kid: string
  signingInput: Buffer
  signature: Buffer
  orgId: string
  webhookIds: string[]
}

/** Structural and claim checks (steps 1-3 minus the candidate match). */
export function parseZDeskJwt(
  token: string | undefined,
  nowMs: number,
  skewMs: number,
): ParsedJwt | null {
  if (!token || token.length > MAX_JWT_LENGTH) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, c, s] = parts as [string, string, string]
  if (!B64URL.test(h) || !B64URL.test(c) || !B64URL.test(s)) return null

  const header = decodeJsonSegment(h)
  if (!header) return null
  if (header['alg'] !== 'RS256') return null
  if (header['typ'] !== undefined && header['typ'] !== 'JWT') return null
  if (header['crit'] !== undefined) return null
  const kid = header['kid']
  if (typeof kid !== 'string' || !kid) return null

  const claims = decodeJsonSegment(c)
  if (!claims) return null
  const exp = claimTimeMs(claims['exp'])
  const iat = claimTimeMs(claims['iat'])
  if (exp === null || iat === null) return null
  if (nowMs > exp + skewMs) return null
  if (iat > nowMs + skewMs) return null
  if (iat > exp) return null

  const iss = claims['iss']
  if (typeof iss !== 'string' || !iss.startsWith('orgId:')) return null
  const orgId = iss.slice('orgId:'.length)
  if (!orgId) return null

  const audRaw = claims['aud']
  const auds = typeof audRaw === 'string' ? [audRaw] : Array.isArray(audRaw) ? audRaw : []
  const webhookIds = auds
    .filter((a): a is string => typeof a === 'string' && a.startsWith('webhookId:'))
    .map((a) => a.slice('webhookId:'.length))
    .filter((id) => id.length > 0)
  if (webhookIds.length === 0) return null

  return {
    kid,
    signingInput: Buffer.from(`${h}.${c}`, 'ascii'),
    signature: Buffer.from(s, 'base64url'),
    orgId,
    webhookIds,
  }
}

function nonEmpty(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

/**
 * The Zoho webhookIds stored for a connection. Zoho Desk issues no signing
 * secret for a webhook (the subscription attributes on the same page are
 * ignoreSourceId, url, name, description, isEnabled, includeEventsFrom and
 * subscriptions), so the per-connection webhook value holds the id instead:
 *   - `extra.webhookRegistrationId`, which the connect flow writes when an
 *     adapter's `registerWebhook` returns an id. This adapter has no
 *     `registerWebhook`, so it is not set today; it is read so that adding
 *     one needs no change here;
 *   - the connection's `webhookSecret`, set by an operator with
 *     `PUT /admin/connections/:id/webhook-secret {"secret":"<webhookId>"}`
 *     after creating the Zoho webhook.
 */
export function candidateWebhookIds(c: WebhookVerificationCandidate): string[] {
  const ids = [nonEmpty(c.extra['webhookRegistrationId']), nonEmpty(c.webhookSecret)]
  return ids.filter((v): v is string => v !== undefined)
}

interface JwksEntry {
  keys: Map<string, KeyObject>
  fetchedAt: number
}

export interface ZohoDeskJwtVerifierOptions {
  /** Injected for tests. Defaults to the global fetch. */
  fetch?: typeof fetch
  now?: () => number
  jwksTtlMs?: number
  refetchCooldownMs?: number
  fetchTimeoutMs?: number
  clockSkewMs?: number
}

export interface ZohoDeskJwtVerifier {
  verify(
    rawBody: Buffer,
    headers: Record<string, string>,
    candidates: readonly WebhookVerificationCandidate[],
  ): Promise<WebhookContextVerification | null>
}

/** Import the usable signing keys of a JWKS document; malformed keys are skipped. */
function importJwks(doc: unknown): Map<string, KeyObject> {
  const out = new Map<string, KeyObject>()
  const keys = isRecord(doc) && Array.isArray(doc['keys']) ? doc['keys'] : []
  for (const k of keys) {
    if (!isRecord(k)) continue
    const kid = k['kid']
    if (typeof kid !== 'string' || !kid) continue
    if (k['kty'] !== 'RSA') continue
    if (k['alg'] !== undefined && k['alg'] !== 'RS256') continue
    if (k['use'] !== undefined && k['use'] !== 'sig') continue
    if (typeof k['n'] !== 'string' || typeof k['e'] !== 'string') continue
    try {
      const key = createPublicKey({ key: { kty: 'RSA', n: k['n'], e: k['e'] }, format: 'jwk' })
      const bits = key.asymmetricKeyDetails?.modulusLength ?? 0
      if (key.asymmetricKeyType !== 'rsa' || bits < MIN_RSA_BITS) continue
      out.set(kid, key)
    } catch {
      continue
    }
  }
  return out
}

export function createZohoDeskJwtVerifier(
  opts: ZohoDeskJwtVerifierOptions = {},
): ZohoDeskJwtVerifier {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const now = opts.now ?? Date.now
  const ttl = opts.jwksTtlMs ?? DEFAULT_JWKS_TTL_MS
  const cooldown = opts.refetchCooldownMs ?? DEFAULT_REFETCH_COOLDOWN_MS
  const timeout = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  const skew = opts.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS

  const cache = new Map<string, JwksEntry>()
  const lastAttempt = new Map<string, number>()
  const inFlight = new Map<string, Promise<JwksEntry | null>>()

  async function fetchJwks(url: string): Promise<JwksEntry | null> {
    const pending = inFlight.get(url)
    if (pending) return pending
    lastAttempt.set(url, now())
    const p = (async (): Promise<JwksEntry | null> => {
      try {
        const res = await doFetch(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(timeout),
        })
        if (!res.ok) return null
        const text = await res.text()
        if (text.length > MAX_JWKS_BYTES) return null
        const entry: JwksEntry = { keys: importJwks(JSON.parse(text)), fetchedAt: now() }
        cache.set(url, entry)
        return entry
      } catch {
        return null
      } finally {
        inFlight.delete(url)
      }
    })()
    inFlight.set(url, p)
    return p
  }

  /**
   * The cached key, or at most one fetch: when the cache is empty or past its
   * TTL, or once when the kid is unknown ("whenever the keys change ... fetch
   * new keys"). Fetches of one URL are at least `cooldown` apart, so
   * unauthenticated requests with invented kids cannot drive a fetch per
   * request, and a failed fetch is not retried in a tight loop.
   */
  async function keyFor(url: string, kid: string): Promise<KeyObject | undefined> {
    let entry = cache.get(url)
    const fresh = entry !== undefined && now() - entry.fetchedAt < ttl
    if (fresh && entry!.keys.has(kid)) return entry!.keys.get(kid)
    // A fetch of this URL is already running (cold start, TTL refresh, or a
    // rotation refetch): wait for it rather than letting the cooldown below
    // turn every concurrent delivery into a 401.
    const pending = inFlight.get(url)
    if (pending) return (await pending)?.keys.get(kid)
    const last = lastAttempt.get(url)
    if (last !== undefined && now() - last < cooldown) return undefined
    entry = (await fetchJwks(url)) ?? undefined
    // Expired keys are never used: a failed refresh fails closed.
    return entry?.keys.get(kid)
  }

  return {
    async verify(_rawBody, headers, candidates) {
      const jwt = parseZDeskJwt(headerValue(headers, 'x-zdesk-jwt'), now(), skew)
      if (!jwt) return null

      const matches = candidates.filter(
        (c) =>
          nonEmpty(c.extra['orgId']) === jwt.orgId &&
          candidateWebhookIds(c).some((id) => jwt.webhookIds.includes(id)),
      )
      // Zero: not ours. Two or more: the same org and webhook are stored on
      // several connections, so the owner is ambiguous. Both fail closed.
      if (matches.length !== 1) return null
      const owner = matches[0]!

      let urls: string[]
      try {
        urls = jwksUrlsFor(String(owner.extra['dataCentre'] ?? ''))
      } catch {
        return null
      }
      for (const url of urls) {
        const key = await keyFor(url, jwt.kid)
        if (!key) continue
        let ok = false
        try {
          ok = cryptoVerify('RSA-SHA256', jwt.signingInput, key, jwt.signature)
        } catch {
          ok = false
        }
        if (ok) return { connectionId: owner.connectionId, bodyAuthenticated: false }
      }
      return null
    },
  }
}

// ── Event parsing ────────────────────────────────────────────────────────────

type Mapped = { resourceType: WebhookResourceType; action: WebhookAction }

/**
 * Event types from the "Events Supported" section of the same page. Each
 * sample carries `payload.id`; thread and comment payloads also carry
 * `payload.ticketId`. Types that have no canonical resource in this vertical
 * (accounts, departments, tasks, calls, events, articles, IM, time entries,
 * approvals, attachments, agent presence) parse as unknown/unknown.
 */
const EVENT_MAP: Record<string, Mapped> = {
  Ticket_Add: { resourceType: 'tickets', action: 'created' },
  Ticket_Update: { resourceType: 'tickets', action: 'updated' },
  Ticket_Delete: { resourceType: 'tickets', action: 'deleted' },
  Ticket_Thread_Add: { resourceType: 'messages', action: 'created' },
  Ticket_Comment_Add: { resourceType: 'messages', action: 'commented' },
  Ticket_Comment_Update: { resourceType: 'messages', action: 'updated' },
  Contact_Add: { resourceType: 'contacts', action: 'created' },
  Contact_Update: { resourceType: 'contacts', action: 'updated' },
  Contact_Delete: { resourceType: 'contacts', action: 'deleted' },
  Agent_Add: { resourceType: 'users', action: 'created' },
  Agent_Update: { resourceType: 'users', action: 'updated' },
  Agent_Delete: { resourceType: 'users', action: 'deleted' },
}

const UNKNOWN: Mapped = { resourceType: 'unknown', action: 'unknown' }

/**
 * What every Zoho Desk event carries instead of the body. The X-ZDesk-JWT does
 * not sign the body, so none of it is passed on as data.
 */
export const UNVERIFIED_BODY_PAYLOAD: Readonly<Record<string, unknown>> = Object.freeze({
  bodyVerified: false,
})

function str(v: unknown): string | undefined {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * A delivery body is a JSON array of events, each
 * `{ payload, prevState?, eventType, eventTime, orgId }` (every sample on the
 * page is `[ { ... } ]`). The router hands over whatever `JSON.parse` returned,
 * so an array arrives here despite the parameter type; a bare event object is
 * accepted too.
 *
 * Only the event type, the mapped resource type and action, and the resource
 * id (plus `ticketId` for threads and comments) are read. They are hints for a
 * re-read through the API: the body is unsigned, so `payload` is
 * {@link UNVERIFIED_BODY_PAYLOAD}, never the body's fields.
 *
 * No delivery or event id is documented, so the event id is built from the
 * event type, resource id and `eventTime`.
 */
export function parseZohoDeskWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const body: unknown = payload
  const items: unknown[] = Array.isArray(body) ? body : [body]
  const events: WebhookEvent[] = []
  for (const item of items) {
    if (!isRecord(item)) continue
    const type = str(item['eventType']) ?? ''
    const resource = isRecord(item['payload']) ? item['payload'] : {}
    const resourceId = str(resource['id']) ?? ''
    const mapped = EVENT_MAP[type] ?? UNKNOWN
    const eventTime = str(item['eventTime']) ?? ''
    events.push({
      id: `zoho-desk:${type}:${resourceId}:${eventTime}`,
      platform: 'zoho-desk',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? str(resource['ticketId']) : undefined,
      payload: { ...UNVERIFIED_BODY_PAYLOAD },
    })
  }
  return events
}

const defaultVerifier = createZohoDeskJwtVerifier()

/** Build a handler around a given verifier (tests inject a mocked JWKS fetch). */
export function createZohoDeskWebhookHandler(verifier: ZohoDeskJwtVerifier): WebhookHandler {
  return {
    verifyWebhook: verifyZohoDeskWebhook,
    parseWebhookEvents: parseZohoDeskWebhookEvents,
    verifyWebhookWithContext: (rawBody, headers, candidates) =>
      verifier.verify(rawBody, headers, candidates),
  }
}

export const ZohoDeskWebhookHandler: WebhookHandler = createZohoDeskWebhookHandler(defaultVerifier)
