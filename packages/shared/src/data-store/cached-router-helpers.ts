/**
 * cached-router-helpers — the cache-vs-live decision layer for resource
 * routers across every vertical.
 *
 * Routers call these helpers instead of touching the adapter directly.
 * Each helper reads three pieces of state off the Fastify request:
 *
 *   request.cacheMode    — 'database' | 'passthrough' | 'external'
 *   request.resourceStore — shared ResourceStore handle (undefined in passthrough)
 *   request.vertical / .platform / .connectionId — from auth middleware
 *
 * `?is_live=true` on the query forces an upstream fetch but still
 * write-throughs the result. Live does not skip writes.
 *
 * In `external` mode, every cache write also fires an outbound webhook
 * event via the `eventEmitter` provided in the plugin opts (wired via
 * `request.dataStoreEvents` when the plugin is configured for it).
 */

import type { FastifyRequest } from 'fastify'
import type { ResourceStore, RawPayloadPolicy } from './resource-store'
import { stripRawPayload, stripRawPayloads } from './strip-raw-payload'

export type DataStoreMode = 'database' | 'passthrough' | 'external'

export interface DataStoreEventEmitter {
  emit(
    op: 'upsert' | 'delete',
    args: {
      vertical: string
      platform: string
      connectionId: string
      resourceType: string
      resourceId: string
      data?: unknown
      fetchedAt: number
    },
  ): void
}

interface CachedRequest extends FastifyRequest {
  cacheMode?: DataStoreMode
  resourceStore?: ResourceStore
  dataStoreEvents?: DataStoreEventEmitter
  /** Reject cached rows older than this many ms (no-op when undefined). */
  cacheMaxAgeMs?: number
  vertical?: string
  platform?: string
  connectionId?: string
  apiKeyId?: string
  rawPayloadEnabled?: RawPayloadPolicy
  /** Identifies the normalizer that produced a record — see BoundContext. */
  normalizerVersion?: (vertical: string, platform: string) => string
  /** Stashed by attachDataStoreContext so the helpers can set headers. */
  cacheReply?: { header: (key: string, value: string) => unknown }
}

interface BoundContext {
  mode: DataStoreMode
  resourceStore: ResourceStore | undefined
  events: DataStoreEventEmitter | undefined
  maxAgeMs: number | undefined
  vertical: string
  platform: string
  connectionId: string
  apiKeyId: string | undefined
  keepRawPayload: boolean
  /**
   * Which normalizer produced (or must have produced) a cached row.
   *
   * Records are cached in NORMALIZED form, so a transform change leaves every
   * existing row in the old shape with nothing to invalidate it. Rows written
   * by a different version are refused rather than served, which turns a
   * silent shape mismatch into an ordinary miss.
   *
   * `undefined` when the embedder wires no version — the column is then
   * ignored and behaviour is exactly as before.
   */
  normVersion: string | undefined
}

function bind(request: FastifyRequest): BoundContext {
  const r = request as CachedRequest
  const mode: DataStoreMode = r.cacheMode ?? 'passthrough'
  // When the cache is on but request decoration is missing (e.g. a router
  // unit test that bypasses the real auth middleware), fall through to
  // passthrough rather than crashing the request.
  const vertical = r.vertical
  const platform = r.platform
  const connectionId = r.connectionId
  if (!vertical || !platform || !connectionId) {
    return {
      mode: 'passthrough',
      resourceStore: undefined,
      events: undefined,
      maxAgeMs: undefined,
      vertical: '',
      platform: '',
      connectionId: '',
      apiKeyId: undefined,
      keepRawPayload: true,
      normVersion: undefined,
    }
  }
  return {
    mode,
    resourceStore: r.resourceStore,
    events: r.dataStoreEvents,
    maxAgeMs: r.cacheMaxAgeMs,
    vertical,
    platform,
    connectionId,
    apiKeyId: r.apiKeyId,
    // Absent policy means keep, so an embedder that never wires this sees no
    // behaviour change.
    keepRawPayload: r.rawPayloadEnabled ? r.rawPayloadEnabled(vertical) : true,
    normVersion: r.normalizerVersion ? r.normalizerVersion(vertical, platform) : undefined,
  }
}

interface RequestLogger {
  debug: (obj: Record<string, unknown>, msg: string) => void
  info: (obj: Record<string, unknown>, msg: string) => void
}

function logger(request: FastifyRequest): RequestLogger {
  const log = (request as unknown as { log?: RequestLogger }).log
  if (log && typeof log.debug === 'function' && typeof log.info === 'function') {
    return log
  }
  // Fallback for harnesses without a Fastify logger.
  return {
    debug: () => {},
    info: () => {},
  }
}

function logCacheEvent(
  request: FastifyRequest,
  ctx: BoundContext,
  event: 'hit' | 'miss' | 'live',
  resourceType: string,
  resourceId?: string,
): void {
  const base = {
    cache: event,
    vertical: ctx.vertical,
    platform: ctx.platform,
    connection_id: ctx.connectionId,
    resource_type: resourceType,
    ...(resourceId ? { resource_id: resourceId } : {}),
  }
  if (event === 'live') {
    // Audit trail: who hit upstream with `?is_live=true`. INFO so it's
    // captured in default log levels.
    logger(request).info({ ...base, api_key_id: ctx.apiKeyId }, 'data-store: live bypass')
  } else {
    logger(request).debug(base, `data-store: ${event}`)
  }
}

/** Cache-status header. `hit` = served from the store (see the Synced-At
 *  header for how old); `miss` = fetched upstream and cached on the way out;
 *  `live` = `?is_live=true` bypass; `passthrough` = this deployment caches
 *  nothing. Absent on mutations. */
export const CACHE_STATUS_HEADER = 'x-opensteward-cache'
/** ISO time the served rows were written to the cache. Only on `hit` — on
 *  every other status the body left upstream moments ago. */
export const CACHE_SYNCED_AT_HEADER = 'x-opensteward-synced-at'
/**
 * WHY the request landed on that status.
 *
 * `status` alone cannot distinguish a disabled cache from a cold one, an
 * expired entry, or a deliberate bypass — all four read as `miss`. Three
 * consecutive review rounds concluded "the cache never hits" from evidence
 * that only ever exercised the bypass path, because every probe carried
 * `limit` and no response said so.
 *
 *   query     — a filter/page param was present; only queryless lists are
 *               answered from cache, so this is a bypass, not a failure
 *   cold      — nothing cached for this collection yet
 *   version   — rows exist but a DIFFERENT normalizer wrote them, so they are
 *               the previous build's shape. Distinguished from `cold` because
 *               a deploy produces a wave of these, and without the distinction
 *               that looks exactly like a cache that stopped working
 *   stale     — rows existed but were older than the configured TTL
 *   disabled  — this deployment caches nothing
 *   requested — `?is_live=true`
 *   fresh     — served from cache (on `hit`)
 */
export const CACHE_REASON_HEADER = 'x-opensteward-cache-reason'
/** Age in seconds of the rows served on a `hit`. Absent otherwise. */
export const CACHE_AGE_HEADER = 'x-opensteward-cache-age'

export type CacheReason =
  'query' | 'cold' | 'stale' | 'version' | 'disabled' | 'requested' | 'fresh'

function setCacheHeaders(
  request: FastifyRequest,
  event: 'hit' | 'miss' | 'live' | 'passthrough',
  reason: CacheReason,
  syncedAt?: number | null,
): void {
  const reply = (request as CachedRequest).cacheReply
  if (!reply) return
  reply.header(CACHE_STATUS_HEADER, event)
  reply.header(CACHE_REASON_HEADER, reason)
  if (event === 'hit' && typeof syncedAt === 'number') {
    reply.header(CACHE_SYNCED_AT_HEADER, new Date(syncedAt).toISOString())
    reply.header(CACHE_AGE_HEADER, String(Math.max(0, Math.round((Date.now() - syncedAt) / 1000))))
  }
}

/** Why a list read could not be answered from cache. */
function missReason(query: unknown, hadStaleRows: boolean, wrongVersion = false): CacheReason {
  if (!isQuerylessList(query)) return 'query'
  if (wrongVersion) return 'version'
  return hadStaleRows ? 'stale' : 'cold'
}

/** Read the `is_live` flag from the query and return a boolean. */
export function isLive(query: unknown): boolean {
  const q = (query ?? {}) as Record<string, unknown>
  const v = q['is_live'] ?? q['live']
  return v === true || v === 'true' || v === '1'
}

/** Strip cache-control flags from forwarded query params so adapters never see them. */
export function stripCacheParams<T extends Record<string, unknown>>(
  query: T,
): Omit<T, 'is_live' | 'live'> {
  const { is_live: _a, live: _b, ...rest } = query
  void _a
  void _b
  return rest as Omit<T, 'is_live' | 'live'>
}

/** Heuristic: a list query is "queryless" when no pagination/search/filter params are present.
 *  Only queryless lists are answered from cache; anything else falls through to upstream. */
function isQuerylessList(query: unknown): boolean {
  const q = (query ?? {}) as Record<string, unknown>
  const keys = Object.keys(q).filter(
    (k) => k !== 'is_live' && k !== 'live' && k !== 'connection_id',
  )
  return keys.length === 0
}

// ── In-process per-key dedupe (stampede protection) ──────────────────────────
//
// Same idea as the `refreshLocks` map in auth-middleware.ts. When two
// concurrent callers ask for the same resource (and aren't `?is_live`), they
// share one upstream call.
const inFlightGets = new Map<string, Promise<unknown>>()

function dedupeKey(ctx: BoundContext, resourceType: string, resourceId: string): string {
  return `${ctx.vertical}:${ctx.platform}:${ctx.connectionId}:${resourceType}:${resourceId}`
}

interface CachedListOptions<T> {
  resourceType: string
  fetch: () => Promise<T[]>
  /**
   * Does this result represent the WHOLE collection?
   *
   * Only the caller can answer: it holds the params it sent the adapter and,
   * via `readUpstreamPage`, whatever total the adapter reported back. The
   * helper sees neither. Return `false` whenever completeness is unproven —
   * the cost is a later cache miss, where the cost of a wrong `true` is a
   * silently truncated collection served to everyone.
   *
   * Omitted, a queryless fetch is trusted as complete: the pre-existing
   * behaviour, kept for the verticals that do not parse paging params yet.
   */
  isComplete?: (rows: T[]) => boolean
}

/**
 * May these rows be stored as the collection's cached contents?
 *
 * The store records rows, not the query that produced them, and the read side
 * treats "some rows exist" as "all rows exist". So anything less than a whole
 * collection must not be written, or it becomes the cached answer to a
 * question it never answered:
 *
 *     GET /invoices?limit=2   -> miss, fetch 2, write 2
 *     GET /invoices           -> queryless -> HIT -> 2 of 60 rows
 *
 * — a silent truncation, served without an upstream call, persisting until the
 * cache is invalidated, and visible to every consumer of that connection.
 *
 * Two conditions, both necessary:
 *   1. the request carried no paging or filter params (`is_live` aside — that
 *      is a refresh, not a filter, and must still write back); and
 *   2. where the router declared a page size, the adapter came back under it.
 *      A response that exactly fills its page is indistinguishable from "there
 *      is more upstream", so it is not evidence of completeness.
 *
 * Failing either way costs a later cache miss. Getting it wrong the other way
 * costs correctness, silently.
 */
function isCompleteCollection<T>(
  query: unknown,
  rows: T[],
  isComplete?: (rows: T[]) => boolean,
): boolean {
  // A query-bearing request is a page or a filter by definition; no callback
  // can make it the collection.
  if (!isQuerylessList(query)) return false
  return isComplete ? isComplete(rows) : true
}

export async function cachedList<T extends { id: string }>(
  request: FastifyRequest,
  opts: CachedListOptions<T>,
): Promise<T[]> {
  const ctx = bind(request)
  const live = isLive(request.query)

  if (ctx.mode === 'passthrough' || !ctx.resourceStore) {
    setCacheHeaders(request, 'passthrough', 'disabled')
    // Passthrough never touches the store, so the policy has to be applied
    // here or the payload reaches the caller unfiltered.
    return stripRawPayloads(ctx.vertical, await opts.fetch(), ctx.keepRawPayload)
  }

  // Cache lookup only attempted on queryless GETs (no pagination/search), and
  // only when something has recorded that the WHOLE collection was written.
  //
  // Row presence is not completeness. `cachedGet` writes single records into
  // the same table, so one `get_invoices(id=…)` used to make an unfiltered
  // list answer with that single invoice — a hit, no upstream call, and
  // `hasMore: false` to confirm it. Observed live against the deployed build.
  let hadStaleRows = false
  let wrongVersion = false
  const completedAt =
    !live && isQuerylessList(request.query)
      ? await ctx.resourceStore.collectionCompletedAt(
          ctx.vertical,
          ctx.platform,
          ctx.connectionId,
          opts.resourceType,
          ctx.normVersion,
        )
      : null
  const completeAndFresh =
    completedAt !== null && (ctx.maxAgeMs === undefined || Date.now() - completedAt <= ctx.maxAgeMs)

  // A version mismatch shows up here as an ABSENT marker, which is otherwise
  // indistinguishable from never having synced. Ask once, on the miss path
  // only, so a deploy's wave of misses is reported as `version` rather than
  // looking like a cache that stopped working.
  if (
    !live &&
    isQuerylessList(request.query) &&
    completedAt === null &&
    ctx.normVersion !== undefined
  ) {
    const anyVersion = await ctx.resourceStore.collectionCompletedAt(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
    )
    if (anyVersion !== null) wrongVersion = true
  }

  if (!live && isQuerylessList(request.query) && completeAndFresh) {
    const cached = await ctx.resourceStore.listWithMeta<T>(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
      {
        normVersion: ctx.normVersion,
        ...(ctx.maxAgeMs !== undefined ? { maxAgeMs: ctx.maxAgeMs } : {}),
      },
    )
    if (cached.data.length > 0) {
      logCacheEvent(request, ctx, 'hit', opts.resourceType)
      setCacheHeaders(request, 'hit', 'fresh', cached.updatedAt)
      return cached.data
    }
    // Empty under a TTL means either "nothing cached" or "everything expired",
    // and those are different operational facts — one says the cache is not
    // working, the other says it is working exactly as configured. Only asked
    // when a TTL is in force, so the common path stays one query.
    // Empty under a version filter means either "nothing cached" or "cached by
    // a previous build", and those are different operational facts.
    const anyVersion = await ctx.resourceStore.listWithMeta<T>(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
    )
    if (anyVersion.data.length > 0) {
      const sameVersion =
        ctx.normVersion === undefined
          ? true
          : (
              await ctx.resourceStore.listWithMeta<T>(
                ctx.vertical,
                ctx.platform,
                ctx.connectionId,
                opts.resourceType,
                { normVersion: ctx.normVersion },
              )
            ).data.length > 0
      if (!sameVersion) wrongVersion = true
      else if (ctx.maxAgeMs !== undefined) hadStaleRows = true
    }
  } else if (completedAt !== null) {
    // Marker present but past its TTL.
    hadStaleRows = true
  }

  if (live) logCacheEvent(request, ctx, 'live', opts.resourceType)
  else logCacheEvent(request, ctx, 'miss', opts.resourceType)
  setCacheHeaders(
    request,
    live ? 'live' : 'miss',
    live ? 'requested' : missReason(request.query, hadStaleRows, wrongVersion),
  )

  // Stripped once, so the stored rows, the emitted events and the response all
  // see the same shape.
  const items = stripRawPayloads(ctx.vertical, await opts.fetch(), ctx.keepRawPayload)
  const complete = isCompleteCollection(request.query, items, opts.isComplete)
  // An EMPTY answer is not marked. The marker would buy nothing over an empty
  // cache — a hit needs at least one row, so the next list goes upstream
  // regardless — and over a non-empty one (rows a get cached, or a collection
  // since emptied) it would serve those rows as the whole collection although
  // upstream just returned none; some adapters turn a 403 into `[]`, too. So
  // it drops any marker standing instead.
  if (complete && items.length === 0) {
    await ctx.resourceStore.invalidateCollection(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
    )
  } else if (complete) {
    await ctx.resourceStore.markCollectionComplete(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
      ctx.normVersion,
    )
  }
  if (items.length > 0 && complete) {
    await ctx.resourceStore.upsertMany(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
      items,
      ctx.normVersion,
    )
    if (ctx.mode === 'external' && ctx.events) {
      const fetchedAt = Date.now()
      for (const item of items) {
        ctx.events.emit('upsert', {
          vertical: ctx.vertical,
          platform: ctx.platform,
          connectionId: ctx.connectionId,
          resourceType: opts.resourceType,
          resourceId: item.id,
          data: item,
          fetchedAt,
        })
      }
    }
  }
  return items
}

interface CachedGetOptions<T> {
  resourceType: string
  resourceId: string
  fetch: () => Promise<T>
}

export async function cachedGet<T extends { id?: string }>(
  request: FastifyRequest,
  opts: CachedGetOptions<T>,
): Promise<T> {
  const ctx = bind(request)
  const live = isLive(request.query)

  if (ctx.mode === 'passthrough' || !ctx.resourceStore) {
    setCacheHeaders(request, 'passthrough', 'disabled')
    return stripRawPayload(ctx.vertical, await opts.fetch(), ctx.keepRawPayload)
  }

  if (!live) {
    const cached = await ctx.resourceStore.getWithMeta<T>(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
      opts.resourceId,
      {
        normVersion: ctx.normVersion,
        ...(ctx.maxAgeMs !== undefined ? { maxAgeMs: ctx.maxAgeMs } : {}),
      },
    )
    if (cached) {
      logCacheEvent(request, ctx, 'hit', opts.resourceType, opts.resourceId)
      setCacheHeaders(request, 'hit', 'fresh', cached.updatedAt)
      return cached.data
    }
  }

  if (live) logCacheEvent(request, ctx, 'live', opts.resourceType, opts.resourceId)
  else logCacheEvent(request, ctx, 'miss', opts.resourceType, opts.resourceId)
  // A single-record read is never bypassed by query params — it is keyed by id
  // — so the only question is whether a row exists under a different
  // normalizer. Asked only on the miss path, so a hit costs nothing.
  let getReason: CacheReason = 'cold'
  if (!live && ctx.normVersion !== undefined) {
    const anyVersion = await ctx.resourceStore.getWithMeta<T>(
      ctx.vertical,
      ctx.platform,
      ctx.connectionId,
      opts.resourceType,
      opts.resourceId,
    )
    if (anyVersion) getReason = 'version'
  }
  setCacheHeaders(request, live ? 'live' : 'miss', live ? 'requested' : getReason)

  const key = dedupeKey(ctx, opts.resourceType, opts.resourceId)
  const existing = inFlightGets.get(key)
  if (existing) return existing as Promise<T>

  const promise = (async () => {
    try {
      const item = stripRawPayload(ctx.vertical, await opts.fetch(), ctx.keepRawPayload)
      await ctx.resourceStore!.upsert(
        ctx.vertical,
        ctx.platform,
        ctx.connectionId,
        opts.resourceType,
        opts.resourceId,
        item,
        ctx.normVersion,
      )
      if (ctx.mode === 'external' && ctx.events) {
        ctx.events.emit('upsert', {
          vertical: ctx.vertical,
          platform: ctx.platform,
          connectionId: ctx.connectionId,
          resourceType: opts.resourceType,
          resourceId: opts.resourceId,
          data: item,
          fetchedAt: Date.now(),
        })
      }
      return item
    } finally {
      inFlightGets.delete(key)
    }
  })()
  inFlightGets.set(key, promise)
  return promise
}

interface WriteThroughOptions {
  resourceType: string
  resourceId: string
  data: unknown
}

/** Call after a successful upstream POST/PATCH/PUT. Updates the cache and,
 *  in `external` mode, emits a `resource.updated`-shaped event. */
export async function writeThrough(
  request: FastifyRequest,
  opts: WriteThroughOptions,
): Promise<void> {
  const ctx = bind(request)
  if (ctx.mode === 'passthrough' || !ctx.resourceStore) return

  // The cached collection no longer matches upstream — it is missing this
  // record, or holds a superseded copy — so it stops counting as complete.
  await ctx.resourceStore.invalidateCollection(
    ctx.vertical,
    ctx.platform,
    ctx.connectionId,
    opts.resourceType,
  )
  const data = stripRawPayload(ctx.vertical, opts.data, ctx.keepRawPayload)
  await ctx.resourceStore.upsert(
    ctx.vertical,
    ctx.platform,
    ctx.connectionId,
    opts.resourceType,
    opts.resourceId,
    data,
    ctx.normVersion,
  )
  if (ctx.mode === 'external' && ctx.events) {
    ctx.events.emit('upsert', {
      vertical: ctx.vertical,
      platform: ctx.platform,
      connectionId: ctx.connectionId,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      data,
      fetchedAt: Date.now(),
    })
  }
}

interface CachedDeleteOptions {
  resourceType: string
  resourceId: string
}

/** Call after a successful upstream DELETE. Drops the cache row and, in
 *  `external` mode, emits a `resource.deleted`-shaped event. */
export async function cachedDelete(
  request: FastifyRequest,
  opts: CachedDeleteOptions,
): Promise<void> {
  const ctx = bind(request)
  if (ctx.mode === 'passthrough' || !ctx.resourceStore) return

  await ctx.resourceStore.invalidateCollection(
    ctx.vertical,
    ctx.platform,
    ctx.connectionId,
    opts.resourceType,
  )
  await ctx.resourceStore.delete(
    ctx.vertical,
    ctx.platform,
    ctx.connectionId,
    opts.resourceType,
    opts.resourceId,
  )
  if (ctx.mode === 'external' && ctx.events) {
    ctx.events.emit('delete', {
      vertical: ctx.vertical,
      platform: ctx.platform,
      connectionId: ctx.connectionId,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      fetchedAt: Date.now(),
    })
  }
}
