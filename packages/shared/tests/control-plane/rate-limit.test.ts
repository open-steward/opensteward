import { describe, it, expect, beforeEach } from 'vitest'
import {
  consumeInMemory,
  inMemoryLimiter,
  redisLimiter,
  resetRateLimitBuckets,
  type RedisLikeClient,
} from '../../src/control-plane/rate-limit'

const CFG = { max: 3, windowMs: 1000 }

describe('rate-limit (in-memory token bucket)', () => {
  beforeEach(() => resetRateLimitBuckets())

  it('allows up to max in the window then blocks', () => {
    expect(consumeInMemory('k', CFG, 0)).toMatchObject({ ok: true, remaining: 2 })
    expect(consumeInMemory('k', CFG, 0)).toMatchObject({ ok: true, remaining: 1 })
    expect(consumeInMemory('k', CFG, 0)).toMatchObject({ ok: true, remaining: 0 })
    const denied = consumeInMemory('k', CFG, 0)
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.limit).toBe(3)
      expect(denied.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it('refills after the window elapses', () => {
    consumeInMemory('k', CFG, 0)
    consumeInMemory('k', CFG, 0)
    consumeInMemory('k', CFG, 0)
    expect(consumeInMemory('k', CFG, 999).ok).toBe(false)
    expect(consumeInMemory('k', CFG, 1000)).toMatchObject({ ok: true, remaining: 2 })
  })

  it('separates buckets per key', () => {
    consumeInMemory('a', CFG, 0)
    consumeInMemory('a', CFG, 0)
    consumeInMemory('a', CFG, 0)
    expect(consumeInMemory('a', CFG, 0).ok).toBe(false)
    expect(consumeInMemory('b', CFG, 0).ok).toBe(true)
  })

  it('inMemoryLimiter exposes the same logic via the async interface', async () => {
    const r1 = await inMemoryLimiter.consume('k', CFG)
    expect(r1.ok).toBe(true)
  })
})

describe('rate-limit (redis backend)', () => {
  function makeFakeRedis(state: { count: number }): RedisLikeClient {
    return {
      async eval(_script, _numKeys, ..._args) {
        state.count += 1
        const ttl = 12345
        return [state.count, ttl]
      },
    }
  }

  it('returns ok+remaining when count is below max', async () => {
    const state = { count: 0 }
    const limiter = redisLimiter(makeFakeRedis(state))
    const r1 = await limiter.consume('k', CFG)
    expect(r1).toMatchObject({ ok: true, limit: 3, remaining: 2 })
    const r2 = await limiter.consume('k', CFG)
    expect(r2).toMatchObject({ ok: true, remaining: 1 })
    const r3 = await limiter.consume('k', CFG)
    expect(r3).toMatchObject({ ok: true, remaining: 0 })
  })

  it('rejects with retryAfterMs when count exceeds max', async () => {
    const state = { count: 3 } // next INCR -> 4 > max=3
    const limiter = redisLimiter(makeFakeRedis(state))
    const denied = await limiter.consume('k', CFG)
    expect(denied.ok).toBe(false)
    if (!denied.ok) {
      expect(denied.retryAfterMs).toBe(12345)
      expect(denied.limit).toBe(3)
    }
  })

  it('fails open when redis throws (best-effort)', async () => {
    const onError = (_err: unknown) => {}
    const limiter = redisLimiter(
      {
        async eval() {
          throw new Error('redis down')
        },
      },
      { onError },
    )
    const result = await limiter.consume('k', CFG)
    expect(result.ok).toBe(true)
  })
})
