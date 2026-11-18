import { describe, it, expect, vi } from 'vitest'
import { TokenRefresher } from '../../../../../../src/verticals/accounting/sync/token-refresher'
import type { AccountingAdapter, Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'
import type { CredentialStore } from '@opensteward/shared'

function makeStore(): CredentialStore {
  // updateRefreshStatus is part of the store contract the refresher uses:
  // every refresh records its outcome so `last_refresh_at` reflects the sync
  // path too, not just the daily keep-alive worker.
  return { updateById: vi.fn(), updateRefreshStatus: vi.fn(), loadById: vi.fn() } as unknown as CredentialStore
}

function makeAdapter(overrides: Partial<AccountingAdapter> = {}): AccountingAdapter {
  return {
    platform: 'test',
    refreshCredentials: vi.fn(),
    ...overrides,
  } as unknown as AccountingAdapter
}

const CONN_A = 'conn-a'
const CONN_B = 'conn-b'

describe('TokenRefresher', () => {
  it('returns credentials as-is when expiresAt is far in the future', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)
    const adapter = makeAdapter()

    const credentials: Credentials = {
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 3_600_000),
    }

    const result = await refresher.ensureFresh(adapter, credentials, CONN_A)

    expect(result).toBe(credentials)
    expect(adapter.refreshCredentials).not.toHaveBeenCalled()
    expect(store.updateById).not.toHaveBeenCalled()
  })

  it('returns credentials as-is when expiresAt is not set', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)
    const adapter = makeAdapter()

    const credentials: Credentials = { accessToken: 'tok' }

    const result = await refresher.ensureFresh(adapter, credentials, CONN_A)

    expect(result).toBe(credentials)
    expect(adapter.refreshCredentials).not.toHaveBeenCalled()
    expect(store.updateById).not.toHaveBeenCalled()
  })

  it('calls adapter.refreshCredentials() when token is about to expire', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)

    const freshCredentials: Credentials = {
      accessToken: 'new-tok',
      expiresAt: new Date(Date.now() + 3_600_000),
    }

    const adapter = makeAdapter({
      refreshCredentials: vi.fn().mockResolvedValue(freshCredentials),
    })

    const credentials: Credentials = {
      accessToken: 'old-tok',
      expiresAt: new Date(Date.now() + 30_000),
    }

    const result = await refresher.ensureFresh(adapter, credentials, CONN_A)

    expect(adapter.refreshCredentials).toHaveBeenCalledWith(credentials)
    expect(result).toBe(freshCredentials)
  })

  it('saves refreshed credentials to store keyed by connection_id', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)

    const freshCredentials: Credentials = {
      accessToken: 'new-tok',
      expiresAt: new Date(Date.now() + 3_600_000),
    }

    const adapter = makeAdapter({
      refreshCredentials: vi.fn().mockResolvedValue(freshCredentials),
    })

    const credentials: Credentials = {
      accessToken: 'old-tok',
      expiresAt: new Date(Date.now() + 10_000),
    }

    await refresher.ensureFresh(adapter, credentials, CONN_A)

    expect(store.updateById).toHaveBeenCalledWith(CONN_A, freshCredentials)
  })

  it('records the refresh outcome so the Connections tab reflects it', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)
    const freshCredentials: Credentials = {
      accessToken: 'new-tok',
      expiresAt: new Date(Date.now() + 3_600_000),
    }
    const adapter = makeAdapter({
      refreshCredentials: vi.fn().mockResolvedValue(freshCredentials),
    })

    const credentials: Credentials = {
      accessToken: 'old-tok',
      expiresAt: new Date(Date.now() + 10_000),
    }

    await refresher.ensureFresh(adapter, credentials, CONN_A)

    expect(store.updateRefreshStatus).toHaveBeenCalledWith(CONN_A, 'ok')
  })

  it('deduplicates concurrent refresh calls for the same connection', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)

    const freshCredentials: Credentials = {
      accessToken: 'new-tok',
      expiresAt: new Date(Date.now() + 3_600_000),
    }

    const adapter = makeAdapter({
      refreshCredentials: vi.fn().mockImplementation(
        () => new Promise<Credentials>((resolve) => setTimeout(() => resolve(freshCredentials), 50)),
      ),
    })

    const credentials: Credentials = {
      accessToken: 'old-tok',
      expiresAt: new Date(Date.now() + 10_000),
    }

    const [result1, result2] = await Promise.all([
      refresher.ensureFresh(adapter, credentials, CONN_A),
      refresher.ensureFresh(adapter, credentials, CONN_A),
    ])

    expect(adapter.refreshCredentials).toHaveBeenCalledTimes(1)
    expect(result1).toBe(freshCredentials)
    expect(result2).toBe(freshCredentials)
  })

  it('refreshes separately for different connections', async () => {
    const store = makeStore()
    const refresher = new TokenRefresher(store)

    const fresh1: Credentials = { accessToken: 'new-tok-1', expiresAt: new Date(Date.now() + 3_600_000) }
    const fresh2: Credentials = { accessToken: 'new-tok-2', expiresAt: new Date(Date.now() + 3_600_000) }

    const adapter = makeAdapter({
      refreshCredentials: vi.fn()
        .mockResolvedValueOnce(fresh1)
        .mockResolvedValueOnce(fresh2),
    })

    const creds: Credentials = {
      accessToken: 'old-tok',
      expiresAt: new Date(Date.now() + 10_000),
    }

    const [result1, result2] = await Promise.all([
      refresher.ensureFresh(adapter, creds, CONN_A),
      refresher.ensureFresh(adapter, creds, CONN_B),
    ])

    expect(adapter.refreshCredentials).toHaveBeenCalledTimes(2)
    expect(result1).toBe(fresh1)
    expect(result2).toBe(fresh2)
  })
})
