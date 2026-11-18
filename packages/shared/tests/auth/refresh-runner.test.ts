import { describe, it, expect, vi } from 'vitest'
import { refreshWithRotationGuard, type RefreshStore } from '../../src/auth/refresh-runner'
import type { Credentials } from '../../src/auth/store'

const creds = (refreshToken: string, accessToken = 'access'): Credentials => ({
  accessToken,
  refreshToken,
  expiresAt: new Date(Date.now() + 3600_000),
})

/** In-memory store recording the persisted blob and last refresh status. */
function fakeStore(initial?: Credentials): RefreshStore & {
  stored?: Credentials
  status?: string
  setStored(c: Credentials): void
} {
  let stored = initial
  let status: string | undefined
  return {
    stored,
    status,
    setStored(c: Credentials) {
      stored = c
      this.stored = c
    },
    async loadById() {
      return stored ?? null
    },
    async updateById(_id, c) {
      stored = c
      this.stored = c
    },
    async updateRefreshStatus(_id, s) {
      status = s
      this.status = s
    },
  }
}

const invalidGrant = () => ({ response: { data: { error: 'invalid_grant' }, status: 400 } })

describe('refreshWithRotationGuard', () => {
  it('persists fresh credentials and ok on success', async () => {
    const store = fakeStore(creds('rt-old'))
    const refresh = vi.fn(async () => creds('rt-new', 'access-new'))

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-old'), refresh)

    expect(res.outcome).toBe('ok')
    expect(res.credentials.accessToken).toBe('access-new')
    expect(store.stored?.refreshToken).toBe('rt-new')
    expect(store.status).toBe('ok')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('retries with the rotated token when a racing replica already rotated it', async () => {
    // Another replica won the race: the store already holds a rotated token.
    const store = fakeStore(creds('rt-rotated-by-other'))
    const refresh = vi
      .fn()
      // First call uses our stale token → provider rejects.
      .mockRejectedValueOnce(invalidGrant())
      // Retry uses the rotated token from the store → succeeds.
      .mockResolvedValueOnce(creds('rt-after-retry', 'access-fresh'))

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-stale'), refresh)

    expect(res.outcome).toBe('ok')
    expect(res.credentials.accessToken).toBe('access-fresh')
    expect(store.status).toBe('ok')
    // Second call must have used the rotated token, not our stale one.
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(refresh.mock.calls[1][0].refreshToken).toBe('rt-rotated-by-other')
  })

  it('marks expired when the token is genuinely dead (no rotation happened)', async () => {
    // Store still holds the same token we used → not a race, the grant is dead.
    const store = fakeStore(creds('rt-stale'))
    const refresh = vi.fn().mockRejectedValue(invalidGrant())

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-stale'), refresh)

    expect(res.outcome).toBe('expired')
    expect(store.status).toBe('expired')
    // Only the initial attempt — no rotated token to retry with.
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('marks expired when the rotation retry also fails with invalid_grant', async () => {
    const store = fakeStore(creds('rt-rotated-by-other'))
    const refresh = vi.fn().mockRejectedValue(invalidGrant())

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-stale'), refresh)

    expect(res.outcome).toBe('expired')
    expect(store.status).toBe('expired')
    // Initial + one retry with the rotated token.
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('maps invalid_client to platform_error without any rotation retry', async () => {
    const store = fakeStore(creds('rt-old'))
    const refresh = vi
      .fn()
      .mockRejectedValue({ response: { data: { error: 'invalid_client' }, status: 401 } })

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-old'), refresh)

    expect(res.outcome).toBe('platform_error')
    expect(store.status).toBe('platform_error')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('maps transient errors to failed without rotation retry', async () => {
    const store = fakeStore(creds('rt-old'))
    const refresh = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))

    const res = await refreshWithRotationGuard(store, 'conn', creds('rt-old'), refresh)

    expect(res.outcome).toBe('failed')
    expect(store.status).toBe('failed')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
