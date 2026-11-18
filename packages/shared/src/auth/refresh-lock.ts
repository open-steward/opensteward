/**
 * Per-connection refresh lock — serialises token refreshes so concurrent
 * attempts on the same `connectionId` collapse into a single upstream
 * token-endpoint call. Shared by:
 *   1. The on-request refresh paths in `auth-middleware.ts` /
 *      `end-user-auth-middleware.ts` (lazy refresh near access-token expiry).
 *   2. The keep-alive worker that proactively refreshes idle connections.
 *
 * Two backends, selected at boot:
 *   - `inProcessBackend` (default) — a Map of in-flight promises. Collapses
 *     concurrent callers WITHIN a single process. Correct for single-replica
 *     deploys and local dev.
 *   - `redisRefreshLock(client)` — a Redis SET-NX mutex layered on top of the
 *     in-process map. Coordinates ACROSS replicas so two pods can't both call
 *     the provider with the same refresh token. Required for rotating-refresh
 *     providers (Xero, HubSpot, Microsoft, QuickBooks, …) under horizontal
 *     scale: without it, the loser of the race gets `invalid_grant` on a
 *     rotated-out token and the connection is wrongly marked expired.
 *
 * Swap the active backend via `setRefreshLock()` at boot (see server.ts),
 * reusing the same ioredis client as the rate limiter.
 */
import { randomUUID } from 'node:crypto'

/**
 * A refresh-lock backend. `withLock` runs `op` under the lock for `key`. The
 * acquirer runs `op` and returns its value. A caller that observes another
 * holder (same-process waiter, or a different replica holding the Redis lock)
 * receives `undefined` and is expected to re-read freshly persisted state from
 * the store after `withLock` resolves.
 */
export interface RefreshLockBackend {
  withLock<T>(key: string, op: () => Promise<T>): Promise<T | undefined>
}

// ── In-process backend ───────────────────────────────────────────────────────

const refreshLocks = new Map<string, Promise<unknown>>()

/**
 * Collapse concurrent same-process callers for `key`. The first caller runs
 * `op`; concurrent callers await the in-flight promise and receive `undefined`.
 * If `op` throws, the in-flight promise is cleared so subsequent callers can
 * retry, and the error propagates to the original caller (and to any waiters,
 * whose `await existing` rejects).
 */
async function inProcessWithLock<T>(key: string, op: () => Promise<T>): Promise<T | undefined> {
  const existing = refreshLocks.get(key)
  if (existing) {
    await existing
    return undefined
  }
  const promise = op().finally(() => {
    refreshLocks.delete(key)
  })
  refreshLocks.set(key, promise)
  return promise
}

const inProcessBackend: RefreshLockBackend = { withLock: inProcessWithLock }

// ── Redis backend ────────────────────────────────────────────────────────────

/**
 * Minimal subset of the ioredis interface we depend on. Mirrors the
 * rate-limit module so the same client satisfies both and the shared package
 * stays dep-free of ioredis (the integration-server brings the dep).
 */
export interface RedisLikeClient {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
}

// Acquire: SET key token NX PX ttl — returns 'OK' if we won, nil otherwise.
const ACQUIRE_LUA = `return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])`
// Release: compare-and-delete so we only drop the lock if we still own it
// (a TTL expiry + re-acquire by another holder must not be clobbered).
const RELEASE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`
// Held: 1 while some replica owns the lock, 0 once released/expired.
const HELD_LUA = `return redis.call('EXISTS', KEYS[1])`

const REDIS_KEY_PREFIX = 'os:refresh-lock:'
/** Lock TTL — a refresh is a single provider round-trip; generous so a slow
 *  endpoint never self-evicts, short enough that a dead holder frees it fast. */
const DEFAULT_TTL_MS = 30_000
const DEFAULT_POLL_MS = 150

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface RedisRefreshLockOptions {
  keyPrefix?: string
  ttlMs?: number
  pollMs?: number
  onError?: (err: unknown) => void
}

/**
 * Build a Redis-backed refresh lock. Layered on the in-process map: same-process
 * callers collapse first (cheap, avoids redundant round-trips), then the single
 * survivor coordinates across replicas via a SET-NX mutex.
 *
 * Fails OPEN on any Redis error — a Redis blip must never stall every refresh.
 * It degrades to best-effort single-process behaviour, and the rotation guard
 * (`refreshWithRotationGuard`) still defends against the resulting race.
 */
export function redisRefreshLock(
  redis: RedisLikeClient,
  opts: RedisRefreshLockOptions = {},
): RefreshLockBackend {
  const prefix = opts.keyPrefix ?? REDIS_KEY_PREFIX
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS
  const onError = opts.onError

  async function waitForRelease(rkey: string): Promise<void> {
    // Bound the wait by the lock TTL — if the holder dies, the key expires and
    // we stop waiting rather than blocking forever.
    const deadline = Date.now() + ttlMs + pollMs
    while (Date.now() < deadline) {
      await sleep(pollMs)
      try {
        if ((await redis.eval(HELD_LUA, 1, rkey)) === 0) return
      } catch (err) {
        onError?.(err)
        return
      }
    }
  }

  return {
    async withLock<T>(key: string, op: () => Promise<T>): Promise<T | undefined> {
      return inProcessWithLock(key, async () => {
        const rkey = `${prefix}${key}`
        const token = randomUUID()
        let acquired = false
        try {
          acquired = (await redis.eval(ACQUIRE_LUA, 1, rkey, token, ttlMs)) === 'OK'
        } catch (err) {
          onError?.(err)
          // Fail open — proceed without the cross-process lock.
          return op()
        }
        if (!acquired) {
          // Another replica holds it; wait for release, then signal the caller
          // to re-read the freshly persisted credentials.
          await waitForRelease(rkey)
          return undefined
        }
        try {
          return await op()
        } finally {
          try {
            await redis.eval(RELEASE_LUA, 1, rkey, token)
          } catch (err) {
            onError?.(err)
          }
        }
      })
    },
  }
}

// ── Active backend selector ─────────────────────────────────────────────────

let activeBackend: RefreshLockBackend = inProcessBackend

/** Swap the active refresh-lock backend. Call once at boot when `REDIS_URL`
 *  is configured; not safe to swap mid-flight. */
export function setRefreshLock(backend: RefreshLockBackend): void {
  activeBackend = backend
}

/**
 * Run `op` under the refresh lock for `connectionId`, delegating to the active
 * backend. The acquirer gets `op`'s value; observers of another holder get
 * `undefined` and should re-read persisted state from the store.
 */
export function withRefreshLock<T>(
  connectionId: string,
  op: () => Promise<T>,
): Promise<T | undefined> {
  return activeBackend.withLock(connectionId, op)
}

/** True iff a refresh is in flight for this connection IN THIS PROCESS. Both
 *  backends route through the in-process map, so this reflects local activity;
 *  it does not observe locks held by other replicas. Diagnostics/tests only. */
export function isRefreshing(connectionId: string): boolean {
  return refreshLocks.has(connectionId)
}
