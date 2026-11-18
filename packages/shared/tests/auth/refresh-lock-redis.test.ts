import { describe, it, expect, vi } from 'vitest'
import { redisRefreshLock, type RedisLikeClient } from '../../src/auth/refresh-lock'

/**
 * Fake Redis implementing just the three Lua scripts the lock uses
 * (SET-NX acquire, compare-and-delete release, EXISTS held) against an
 * in-memory map. TTL is ignored — these tests exercise lock semantics, not
 * expiry. `another replica` is simulated by writing the key directly.
 */
function fakeRedis(): RedisLikeClient & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async eval(script: string, _numKeys: number, ...args: Array<string | number>) {
      const key = String(args[0])
      if (script.includes("'SET'")) {
        if (store.has(key)) return null // NX: already held
        store.set(key, String(args[1]))
        return 'OK'
      }
      if (script.includes("'GET'")) {
        // compare-and-delete
        if (store.get(key) === String(args[1])) {
          store.delete(key)
          return 1
        }
        return 0
      }
      if (script.includes("'EXISTS'")) {
        return store.has(key) ? 1 : 0
      }
      throw new Error(`unexpected script: ${script}`)
    },
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('redisRefreshLock', () => {
  it('acquirer runs op and releases the lock', async () => {
    const redis = fakeRedis()
    const lock = redisRefreshLock(redis)
    const op = vi.fn(async () => 'result')

    const res = await lock.withLock(`conn-${Math.random()}`, op)

    expect(res).toBe('result')
    expect(op).toHaveBeenCalledTimes(1)
    expect(redis.store.size).toBe(0) // released
  })

  it('waiter does NOT run op when another replica holds the lock, returns undefined', async () => {
    const redis = fakeRedis()
    const key = `conn-${Math.random()}`
    const lock = redisRefreshLock(redis, { ttlMs: 2000, pollMs: 20 })

    // Another replica already holds the Redis lock.
    redis.store.set(`os:refresh-lock:${key}`, 'other-replica-token')

    const op = vi.fn(async () => 'should-not-run')
    const pending = lock.withLock(key, op)

    // Other replica releases mid-wait.
    setTimeout(() => redis.store.delete(`os:refresh-lock:${key}`), 50)

    const res = await pending
    expect(res).toBeUndefined()
    expect(op).not.toHaveBeenCalled()
  })

  it('fails open (runs op) when Redis acquire errors', async () => {
    const redis: RedisLikeClient = {
      eval: vi.fn().mockRejectedValue(new Error('redis down')),
    }
    const onError = vi.fn()
    const lock = redisRefreshLock(redis, { onError })
    const op = vi.fn(async () => 'ran-anyway')

    const res = await lock.withLock(`conn-${Math.random()}`, op)

    expect(res).toBe('ran-anyway')
    expect(op).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalled()
  })

  it('release is compare-and-delete: does not drop a lock owned by another token', async () => {
    const redis = fakeRedis()
    const key = `conn-${Math.random()}`
    const lock = redisRefreshLock(redis)

    await lock.withLock(key, async () => {
      // Simulate our lock expiring and another replica grabbing the slot
      // mid-op: overwrite with a different token.
      redis.store.set(`os:refresh-lock:${key}`, 'other-token')
      return 'x'
    })

    // Our compare-and-delete must NOT have removed the other replica's lock.
    expect(redis.store.get(`os:refresh-lock:${key}`)).toBe('other-token')
  })

  it('collapses concurrent same-process callers to a single op (in-process layer)', async () => {
    const redis = fakeRedis()
    const key = `conn-${Math.random()}`
    const lock = redisRefreshLock(redis)
    let calls = 0

    const first = lock.withLock(key, async () => {
      calls++
      await sleep(30)
      return 'first'
    })
    const second = lock.withLock(key, async () => {
      calls++
      return 'second'
    })

    const [a, b] = await Promise.all([first, second])
    expect(calls).toBe(1)
    expect(a).toBe('first')
    expect(b).toBeUndefined()
  })
})
