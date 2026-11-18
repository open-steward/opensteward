/**
 * Idempotency-Key middleware (Stripe-style).
 *
 * Honours an `Idempotency-Key` request header on POST/PATCH/PUT/DELETE so safe
 * retries don't double-process. Storage: ioredis-compatible client when
 * provided; otherwise an in-memory LRU (single-process deployments).
 *
 * Call `registerIdempotency(fastify, redis)` on the root instance BEFORE any
 * route or plugin is registered: it attaches itself to each route as that
 * route is added (an `onRoute` hook), so a route added earlier is untracked.
 *
 * Behaviour:
 *  - The key is claimed by a route-level preHandler, which Fastify runs after
 *    every instance preHandler. Authentication, scope checks and the license
 *    gates therefore all run first: a request they refuse never claims a key,
 *    and is never replayed. Like Stripe, only a request that reached its
 *    handler has a result to keep.
 *  - Key on (tenant | credential fingerprint | "anon") + method + route +
 *    Idempotency-Key. The tenant is the one authentication set, so one
 *    tenant's stored response is never replayed to another.
 *  - The stored record is matched on a fingerprint of the full URL (path and
 *    query, so `?connection_id`) and the body: reusing the key for another
 *    request is a conflict, never a replay of the other request's response.
 *  - On first request: process normally, then store status+headers+body
 *    under the key with a 24h TTL. EXCEPT a refusal that says nothing
 *    happened and may not hold on a retry: 401, 403, 409, 429, and any
 *    license refusal (`error.code` LICENSE_*) at any status. Those release
 *    the key, so a retry is checked afresh — a freed connection slot or a
 *    renewed license applies at once (P6: a stale cache never refuses).
 *  - On retry with same key + same request: replay the stored response
 *    verbatim, plus an `Idempotency-Replayed: true` header.
 *  - On retry with same key + DIFFERENT request: 422 + machine-readable
 *    `Idempotency-Key-Conflict` payload (the canonical Stripe behaviour). The
 *    stored record is left as it was.
 *  - On concurrent retry while the first is still in-flight: 409 with
 *    a `Retry-After: 1` header so the caller can backoff and retry.
 *  - GET/HEAD/OPTIONS bypass entirely (already idempotent).
 *  - Streaming and hijacked responses are not stored (we never see the full
 *    body); their claim is released, so a retry runs again.
 *
 * The Idempotency-Key value is opaque to the server — clients are expected
 * to use a UUIDv4 or another sufficiently-random token. Max length 255.
 */

import crypto from 'node:crypto'
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify'
import { LICENSE_ERROR_CODES } from '../licensing/errors'

const IDEM_HEADER = 'idempotency-key'
const IDEM_REPLAYED_HEADER = 'idempotency-replayed'
const IDEM_CONFLICT_HEADER = 'idempotency-key-conflict'
const TTL_SECONDS = 86_400 // 24h
const MAX_KEY_LENGTH = 255
const TRACKED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const IN_FLIGHT_MARKER = '__IN_FLIGHT__'

/**
 * Refusals that say the request did nothing and may not hold on a retry:
 * unauthenticated, forbidden, conflicting with the current state, rate
 * limited. Storing one would replay a stale "no" for 24 h.
 */
const NOT_STORED_STATUSES: ReadonlySet<number> = new Set([401, 403, 409, 429])
const LICENSE_CODES: ReadonlySet<string> = new Set(Object.values(LICENSE_ERROR_CODES))

/**
 * Minimal ioredis-compatible subset we depend on. Letting hosts pass any
 * client (ioredis, in-memory shim) keeps this package dep-free.
 */
export interface IdempotencyStore {
  get(key: string): Promise<string | null>
  set(
    key: string,
    value: string,
    mode: 'EX',
    seconds: number,
    flag?: 'NX',
  ): Promise<string | null | 'OK'>
  del(key: string): Promise<number | unknown>
}

interface CachedResponse {
  bodyHash: string
  statusCode: number
  headers: Record<string, string>
  body: string
}

/** A key this request claimed; `settled` once it is stored or released. */
interface Claim {
  key: string
  bodyHash: string
  settled: boolean
}

/**
 * The request's fingerprint: its full URL (path and query) and its body. A
 * retry sends the same; the same key on another connection or with another
 * body does not, and is answered as a conflict.
 */
function hashRequest(req: FastifyRequest): string {
  const body = req.body
  const serialised =
    body === undefined || body === null
      ? ''
      : typeof body === 'string'
        ? body
        : JSON.stringify(body)
  return crypto.createHash('sha256').update(req.url).update('\n').update(serialised).digest('hex')
}

/**
 * Whose key this is. The tenant authentication set, when it set one; on a
 * route that authenticates inside its handler there is none yet, so the
 * credential presented, hashed (never stored raw); else "anon".
 */
function principalOf(req: FastifyRequest): string {
  const tenant = (req as FastifyRequest & { tenantId?: unknown }).tenantId
  if (typeof tenant === 'string' && tenant !== '') return `t:${tenant}`
  const parts = [req.headers['authorization'], req.headers['x-admin-secret']].map((v) =>
    Array.isArray(v) ? v.join(',') : (v ?? ''),
  )
  if (parts.every((p) => p === '')) return 'anon'
  const digest = crypto.createHash('sha256').update(parts.join('\n')).digest('hex')
  return `c:${digest.slice(0, 32)}`
}

function buildKey(req: FastifyRequest, idemKey: string): string {
  const route = req.routeOptions?.url ?? req.url.split('?')[0]
  return `idem:${principalOf(req)}:${req.method}:${route}:${idemKey}`
}

/** A license refusal, whatever its status: `{ error: { code: 'LICENSE_…' } }`. */
function isLicenseRefusal(body: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }
  const error = (parsed as { error?: unknown } | null)?.error
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : ''
  return typeof code === 'string' && LICENSE_CODES.has(code)
}

function isStorable(statusCode: number, body: string): boolean {
  if (NOT_STORED_STATUSES.has(statusCode)) return false
  return statusCode < 400 || !isLicenseRefusal(body)
}

/**
 * Register the idempotency hooks on a Fastify instance.
 *
 * Pass an ioredis-compatible `store` when running multi-replica; in
 * single-replica deploys, omit and the middleware uses a per-process
 * in-memory map (lost on restart but adequate for dev / single-container).
 *
 * Register it before any route: it attaches to each route as it is added.
 */
export function registerIdempotency(fastify: FastifyInstance, store?: IdempotencyStore): void {
  const backing = store ?? createMemoryStore()
  const claims = new WeakMap<FastifyRequest, Claim>()

  // Detect the header, validate, look up any stored response, and either
  // short-circuit with a replay or claim the key for this request. Runs as
  // the route's LAST preHandler, so everything that can refuse has run.
  const claimKey: preHandlerAsyncHookHandler = async function idempotencyClaim(request, reply) {
    if (!TRACKED_METHODS.has(request.method)) return

    const headerVal = request.headers[IDEM_HEADER]
    const idemKey = Array.isArray(headerVal) ? headerVal[0] : headerVal
    if (!idemKey) return

    if (idemKey.length > MAX_KEY_LENGTH) {
      return reply.code(400).send({
        code: 'idempotency_key_invalid',
        description: `Idempotency-Key exceeds ${MAX_KEY_LENGTH} characters.`,
        type: 'validation',
      })
    }

    const key = buildKey(request, idemKey)
    const bodyHash = hashRequest(request)

    const existing = await backing.get(key)
    if (existing !== null && existing !== undefined) {
      return replayOrReject(reply, existing, bodyHash)
    }

    // No previous attempt — claim the key with a placeholder marker so a
    // concurrent retry sees "in flight" rather than racing us.
    const claimed = await backing.set(
      key,
      JSON.stringify({ marker: IN_FLIGHT_MARKER, bodyHash }),
      'EX',
      TTL_SECONDS,
      'NX',
    )
    if (claimed !== 'OK') {
      // Someone else claimed it between our get and set (NX answers null):
      // answer as their retry would. If their claim is already gone, they
      // are still settling it — in flight, retry shortly.
      const raced = await backing.get(key)
      return replayOrReject(reply, raced ?? JSON.stringify({ marker: IN_FLIGHT_MARKER }), bodyHash)
    }
    claims.set(request, { key, bodyHash, settled: false })
  }

  fastify.addHook('onRoute', (route) => {
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).map((m) =>
      String(m).toUpperCase(),
    )
    if (!methods.some((m) => TRACKED_METHODS.has(m))) return
    const own = route.preHandler
    // A fresh array: routes may share one preHandler array between them.
    route.preHandler = [...(own === undefined ? [] : Array.isArray(own) ? own : [own]), claimKey]
  })

  // ON-SEND: when the route handler finishes, persist the response so the
  // next retry with the same key replays it verbatim — or release the key.
  fastify.addHook('onSend', async (request, reply, payload) => {
    const claim = claims.get(request)
    if (!claim || claim.settled) return payload
    claim.settled = true

    let bodyStr: string
    if (payload === null || payload === undefined) bodyStr = ''
    else if (typeof payload === 'string') bodyStr = payload
    else if (Buffer.isBuffer(payload)) bodyStr = payload.toString('utf8')
    else {
      // A stream: a replay would need the same streaming pipeline, which this
      // middleware does not implement. Release, or every retry reads "in flight".
      await backing.del(claim.key)
      return payload
    }

    if (!isStorable(reply.statusCode, bodyStr)) {
      await backing.del(claim.key)
      return payload
    }
    const record: CachedResponse = {
      bodyHash: claim.bodyHash,
      statusCode: reply.statusCode,
      headers: collectHeaders(reply),
      body: bodyStr,
    }
    await backing.set(claim.key, JSON.stringify(record), 'EX', TTL_SECONDS)
    return payload
  })

  // A hijacked reply skips onSend: release its claim here instead.
  fastify.addHook('onResponse', async (request) => {
    const claim = claims.get(request)
    if (!claim || claim.settled) return
    claim.settled = true
    await backing.del(claim.key)
  })
}

function replayOrReject(reply: FastifyReply, raw: string, currentBodyHash: string): FastifyReply {
  let parsed: { marker?: string; bodyHash?: string } & Partial<CachedResponse>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return reply.code(500).send({
      code: 'idempotency_corrupt',
      description: 'Stored idempotency record is corrupt; discard the key and retry.',
      type: 'internal',
    })
  }

  if (parsed.marker === IN_FLIGHT_MARKER) {
    if (parsed.bodyHash && parsed.bodyHash !== currentBodyHash) {
      return sendBodyConflict(reply)
    }
    reply.header('retry-after', '1')
    return reply.code(409).send({
      code: 'idempotency_in_flight',
      description:
        'A request with this Idempotency-Key is currently in flight. Retry after the indicated delay.',
      type: 'conflict',
    })
  }

  if (parsed.bodyHash !== currentBodyHash) {
    return sendBodyConflict(reply)
  }

  // Replay the stored response verbatim.
  for (const [name, value] of Object.entries(parsed.headers ?? {})) {
    reply.header(name, value)
  }
  reply.header(IDEM_REPLAYED_HEADER, 'true')
  return reply.code(parsed.statusCode ?? 200).send(parsed.body ?? '')
}

function sendBodyConflict(reply: FastifyReply): FastifyReply {
  reply.header(IDEM_CONFLICT_HEADER, 'true')
  return reply.code(422).send({
    code: 'idempotency_key_reused_with_different_body',
    description:
      'This Idempotency-Key was previously used with a different request (body, path or query). Idempotency keys must be unique per logical operation.',
    type: 'conflict',
  })
}

function collectHeaders(reply: FastifyReply): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = reply.getHeaders()
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue
    out[k] = Array.isArray(v) ? v.join(', ') : String(v)
  }
  return out
}

/**
 * Process-local fallback store. Trades correctness across replicas for
 * zero infrastructure on dev. Bounded to 10k entries; entries past TTL
 * are evicted lazily on access.
 */
function createMemoryStore(): IdempotencyStore {
  const data = new Map<string, { value: string; expires: number }>()
  const MAX = 10_000
  const now = () => Date.now()

  function evictIfExpired(key: string): void {
    const entry = data.get(key)
    if (entry && entry.expires <= now()) data.delete(key)
  }
  function trim(): void {
    if (data.size <= MAX) return
    const toRemove = data.size - MAX
    let i = 0
    for (const k of data.keys()) {
      if (i++ >= toRemove) break
      data.delete(k)
    }
  }

  return {
    async get(key) {
      evictIfExpired(key)
      return data.get(key)?.value ?? null
    },
    async set(key, value, _mode, seconds, flag) {
      evictIfExpired(key)
      if (flag === 'NX' && data.has(key)) return null
      data.set(key, { value, expires: now() + seconds * 1000 })
      trim()
      return 'OK'
    },
    async del(key) {
      return data.delete(key) ? 1 : 0
    },
  }
}
