import { describe, it, expect } from 'vitest'
import { withRefreshLock, isRefreshing } from '../../src/auth/refresh-lock'

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('withRefreshLock', () => {
  it('runs op exactly once when called twice in flight', async () => {
    const id = `lock-${Math.random()}`
    let calls = 0
    const gate = defer<void>()

    const first = withRefreshLock(id, async () => {
      calls++
      await gate.promise
      return 'first'
    })
    // Second caller arrives mid-flight → should NOT re-run op.
    const second = withRefreshLock(id, async () => {
      calls++
      return 'second'
    })

    expect(isRefreshing(id)).toBe(true)
    gate.resolve()
    await Promise.all([first, second])
    expect(calls).toBe(1)
    expect(isRefreshing(id)).toBe(false)
  })

  it('clears the lock on op rejection so retries work', async () => {
    const id = `err-${Math.random()}`
    let calls = 0

    await expect(
      withRefreshLock(id, async () => {
        calls++
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    expect(isRefreshing(id)).toBe(false)

    // Second attempt should run fresh, not block on a stale lock.
    const result = await withRefreshLock(id, async () => {
      calls++
      return 'ok'
    })
    expect(calls).toBe(2)
    expect(result).toBe('ok')
  })

  it('different connection ids run concurrently', async () => {
    const order: string[] = []
    const a = defer<void>()
    const b = defer<void>()

    const pa = withRefreshLock('a', async () => {
      order.push('a-start')
      await a.promise
      order.push('a-end')
    })
    const pb = withRefreshLock('b', async () => {
      order.push('b-start')
      await b.promise
      order.push('b-end')
    })

    // Both should start before either ends.
    expect(order).toEqual(['a-start', 'b-start'])
    b.resolve()
    a.resolve()
    await Promise.all([pa, pb])
    expect(order).toContain('a-end')
    expect(order).toContain('b-end')
  })
})
