/**
 * The refresher the sync workers use.
 *
 * The shared refresher records the outcome of every refresh, so
 * `lastRefreshAt` / `lastRefreshStatus` reflect sync-path refreshes as well
 * as the daily keep-alive worker. That keeps two consumers honest:
 *
 *   - the Connections tab — a sync that refreshes a token updates "last
 *     refreshed" rather than leaving a day-old timestamp beside a token
 *     minted seconds ago.
 *   - `computeStatus()` — which reads `lastRefreshStatus` to decide whether
 *     a grant is dead. A refresh that fails in the sync path must not leave
 *     an `'ok'` from the last worker tick standing, or a broken connection
 *     reads as healthy.
 *
 * Routing through `refreshWithRotationGuard` also picks up the
 * cross-replica rotation-race retry.
 */
import { describe, it, expect, vi } from 'vitest'
import { TokenRefresher } from '../../src/auth/token-refresher'
import type { Credentials } from '../../src/auth/store'

function creds(expiresInMs: number | null): Credentials {
  return {
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: expiresInMs === null ? null : new Date(Date.now() + expiresInMs),
  } as Credentials
}

/** Minimal store: records what the refresher persisted. */
function makeStore() {
  const calls: { updated: Credentials[]; statuses: string[] } = { updated: [], statuses: [] }
  return {
    calls,
    async updateById(_id: string, c: Credentials) {
      calls.updated.push(c)
    },
    async updateRefreshStatus(_id: string, status: string) {
      calls.statuses.push(status)
    },
    async loadById() {
      return null
    },
  }
}

describe('TokenRefresher.ensureFresh', () => {
  it('leaves a healthy token alone', async () => {
    const store = makeStore()
    const adapter = { refreshCredentials: vi.fn() }
    const input = creds(10 * 60_000)
    const out = await new TokenRefresher(store as never).ensureFresh(adapter as never, input, 'c1')
    expect(out).toBe(input)
    expect(adapter.refreshCredentials).not.toHaveBeenCalled()
  })

  it('refreshes a token inside the threshold and persists the new one', async () => {
    const store = makeStore()
    const fresh = creds(3600_000)
    const adapter = { refreshCredentials: vi.fn(async () => fresh) }
    const out = await new TokenRefresher(store as never).ensureFresh(
      adapter as never,
      creds(10_000),
      'c1',
    )
    expect(out).toBe(fresh)
    expect(store.calls.updated).toEqual([fresh])
  })

  it('records the refresh so the Connections tab reflects it', async () => {
    const store = makeStore()
    const adapter = { refreshCredentials: vi.fn(async () => creds(3600_000)) }
    await new TokenRefresher(store as never).ensureFresh(adapter as never, creds(10_000), 'c1')
    expect(store.calls.statuses).toEqual(['ok'])
  })

  it('records a failure instead of leaving a stale ok standing', async () => {
    const store = makeStore()
    const adapter = {
      refreshCredentials: vi.fn(async () => {
        throw Object.assign(new Error('invalid_grant'), {
          response: { status: 400, data: { error: 'invalid_grant' } },
        })
      }),
    }
    await expect(
      new TokenRefresher(store as never).ensureFresh(adapter as never, creds(10_000), 'c1'),
    ).rejects.toThrow()
    expect(store.calls.statuses).toEqual(['expired'])
  })

  it('dedupes concurrent callers onto one refresh', async () => {
    const store = makeStore()
    const adapter = {
      refreshCredentials: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 20))
        return creds(3600_000)
      }),
    }
    const refresher = new TokenRefresher(store as never)
    const stale = creds(10_000)
    await Promise.all([
      refresher.ensureFresh(adapter as never, stale, 'c1'),
      refresher.ensureFresh(adapter as never, stale, 'c1'),
      refresher.ensureFresh(adapter as never, stale, 'c1'),
    ])
    expect(adapter.refreshCredentials).toHaveBeenCalledTimes(1)
  })

  it('treats a token with no expiry as healthy', async () => {
    const store = makeStore()
    const adapter = { refreshCredentials: vi.fn() }
    const input = creds(null)
    const out = await new TokenRefresher(store as never).ensureFresh(adapter as never, input, 'c1')
    expect(out).toBe(input)
    expect(adapter.refreshCredentials).not.toHaveBeenCalled()
  })
})
