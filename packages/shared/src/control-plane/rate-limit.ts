/**
 * Pluggable rate-limit backend for tenant-scoped API keys.
 *
 *   - `inMemoryLimiter` (default) — single-process token bucket. Fine for
 *     single-instance deployments and local dev. Resets on restart.
 *   - `redisLimiter(client)` — Redis-backed counter; share a single budget
 *     across multiple integration-server replicas behind a load balancer.
 *
 * Middleware calls `getRateLimiter().consume(key, config)` — swap the
 * active limiter via `setRateLimiter()` at boot.
 */

export interface RateLimitConfig {
  /** Maximum requests allowed in `windowMs`. */
  max: number
  /** Window in milliseconds. */
  windowMs: number
}

export type RateLimitResult =
  | { ok: true; remaining: number; limit: number; resetMs: number }
  | { ok: false; retryAfterMs: number; limit: number }

export interface RateLimiter {
  consume(key: string, config?: RateLimitConfig): Promise<RateLimitResult>
}

export const DEFAULT_API_KEY_RATE_LIMIT: RateLimitConfig = {
  max: 600,
  windowMs: 60_000,
}

// ── In-memory backend ────────────────────────────────────────────────────────

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

/**
 * Synchronous in-memory token bucket. Exposed for tests that want to drive
 * the bucket clock deterministically — the public path is the async
 * `consume()` below or `inMemoryLimiter.consume()`.
 */
export function consumeInMemory(
  key: string,
  config: RateLimitConfig = DEFAULT_API_KEY_RATE_LIMIT,
  now: number = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= config.windowMs) {
    bucket = { count: 1, windowStart: now }
    buckets.set(key, bucket)
    return { ok: true, remaining: config.max - 1, limit: config.max, resetMs: config.windowMs }
  }
  if (bucket.count >= config.max) {
    return {
      ok: false,
      retryAfterMs: bucket.windowStart + config.windowMs - now,
      limit: config.max,
    }
  }
  bucket.count += 1
  return {
    ok: true,
    remaining: config.max - bucket.count,
    limit: config.max,
    resetMs: bucket.windowStart + config.windowMs - now,
  }
}

export const inMemoryLimiter: RateLimiter = {
  async consume(key, config = DEFAULT_API_KEY_RATE_LIMIT) {
    return consumeInMemory(key, config)
  },
}

/** Test helper — wipes every bucket. */
export function resetRateLimitBuckets(): void {
  buckets.clear()
}

// ── Redis backend ────────────────────────────────────────────────────────────

/**
 * Minimal subset of the ioredis interface we depend on. Letting callers
 * inject any client matching this shape keeps the open-shared package
 * itself dep-free of ioredis (the integration-server brings the dep).
 */
export interface RedisLikeClient {
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>
}

const REDIS_LUA = `
local cur = redis.call('INCR', KEYS[1])
if cur == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { cur, ttl }
`.trim()

const REDIS_KEY_PREFIX = 'os:rl:'

/**
 * Build a Redis-backed limiter. On any Redis error the limiter fails OPEN
 * — a transient outage shouldn't 429 every request — and the caller logs.
 */
export function redisLimiter(
  redis: RedisLikeClient,
  opts: { keyPrefix?: string; onError?: (err: unknown) => void } = {},
): RateLimiter {
  const prefix = opts.keyPrefix ?? REDIS_KEY_PREFIX
  return {
    async consume(key, config = DEFAULT_API_KEY_RATE_LIMIT) {
      try {
        const raw = (await redis.eval(REDIS_LUA, 1, `${prefix}${key}`, config.windowMs)) as
          [number, number] | undefined
        if (!Array.isArray(raw) || raw.length !== 2) {
          throw new Error('redis EVAL returned unexpected shape')
        }
        const [count, pttlMs] = raw
        const ttlMs = pttlMs >= 0 ? pttlMs : config.windowMs
        if (count > config.max) {
          return { ok: false, retryAfterMs: ttlMs, limit: config.max }
        }
        return {
          ok: true,
          remaining: Math.max(config.max - count, 0),
          limit: config.max,
          resetMs: ttlMs,
        }
      } catch (err) {
        opts.onError?.(err)
        // Fail open — a Redis blip shouldn't reject every request.
        return {
          ok: true,
          remaining: config.max,
          limit: config.max,
          resetMs: config.windowMs,
        }
      }
    },
  }
}

// ── Active backend selector ─────────────────────────────────────────────────

let activeLimiter: RateLimiter = inMemoryLimiter

/**
 * Swap the active limiter used by `consume()`. Call once at boot when
 * `REDIS_URL` is configured; not safe to swap mid-flight.
 */
export function setRateLimiter(limiter: RateLimiter): void {
  activeLimiter = limiter
}

export function getRateLimiter(): RateLimiter {
  return activeLimiter
}

/**
 * Async public entrypoint used by the middleware. Always delegates to the
 * active backend (defaults to in-memory).
 */
export function consume(
  key: string,
  config: RateLimitConfig = DEFAULT_API_KEY_RATE_LIMIT,
): Promise<RateLimitResult> {
  return activeLimiter.consume(key, config)
}
