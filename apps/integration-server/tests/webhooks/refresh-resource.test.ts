import { describe, it, expect, vi } from 'vitest'
import { createRefreshResource } from '../../src/webhooks/refresh-resource'

function deps(adapter: Record<string, unknown> | undefined) {
  const resourceStore = {
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  }
  const store = { loadById: vi.fn().mockResolvedValue({ accessToken: 'tok' }) }
  const registry = { get: vi.fn().mockReturnValue(adapter) }
  const refresh = createRefreshResource({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registry: registry as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resourceStore: resourceStore as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: store as any,
    refreshMaps: { payments: { charges: 'getCharge' } },
  })
  return { refresh, resourceStore, store, registry }
}

// Shape mirrors what the webhook consumer hands the hook: it always supplies
// `payload` (`event.payload ?? null`), so it is never absent in production.
const base = {
  vertical: 'payments',
  platform: 'stripe',
  connectionId: 'conn1',
  tenantId: 'owner1',
  resourceType: 'charges',
  resourceId: 'ch_1',
  action: 'succeeded',
  payload: { id: 'ch_1', object: 'charge', amount: 100, status: 'succeeded' },
}

describe('createRefreshResource', () => {
  it('fetches via the mapped get-method and upserts', async () => {
    const getCharge = vi.fn().mockResolvedValue({ id: 'ch_1', amount: 100 })
    const { refresh, resourceStore } = deps({ getCharge })
    await refresh(base)
    expect(getCharge).toHaveBeenCalledWith({ accessToken: 'tok' }, 'ch_1')
    expect(resourceStore.upsert).toHaveBeenCalledWith(
      'payments',
      'stripe',
      'owner1',
      'charges',
      'ch_1',
      { id: 'ch_1', amount: 100 },
    )
  })

  it('deletes on a delete-like action without fetching', async () => {
    const getCharge = vi.fn()
    const { refresh, resourceStore } = deps({ getCharge })
    await refresh({ ...base, action: 'deleted' })
    expect(resourceStore.delete).toHaveBeenCalledWith(
      'payments',
      'stripe',
      'owner1',
      'charges',
      'ch_1',
    )
    expect(getCharge).not.toHaveBeenCalled()
  })

  it('re-reads instead of deleting on a delete action from an unauthenticated body', async () => {
    // A forged "deleted" body for a record that still exists refreshes it.
    const getCharge = vi.fn().mockResolvedValue({ id: 'ch_1', amount: 100 })
    const { refresh, resourceStore } = deps({ getCharge })
    await refresh({ ...base, action: 'deleted', bodyAuthenticated: false })
    expect(getCharge).toHaveBeenCalledWith({ accessToken: 'tok' }, 'ch_1')
    expect(resourceStore.delete).not.toHaveBeenCalled()
    expect(resourceStore.upsert).toHaveBeenCalledTimes(1)
  })

  it('evicts on an unauthenticated delete only when the platform confirms a 404', async () => {
    for (const err of [{ response: { status: 404 } }, { statusCode: 404 }]) {
      const getCharge = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), err))
      const { refresh, resourceStore } = deps({ getCharge })
      await refresh({ ...base, action: 'deleted', bodyAuthenticated: false })
      expect(resourceStore.delete).toHaveBeenCalledWith(
        'payments',
        'stripe',
        'owner1',
        'charges',
        'ch_1',
      )
      expect(resourceStore.upsert).not.toHaveBeenCalled()
    }
  })

  it('keeps the row and rethrows when the re-read fails for another reason', async () => {
    const getCharge = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }))
    const { refresh, resourceStore } = deps({ getCharge })
    await expect(refresh({ ...base, action: 'deleted', bodyAuthenticated: false })).rejects.toThrow(
      'boom',
    )
    expect(resourceStore.delete).not.toHaveBeenCalled()
  })

  it('does not evict on a 404 re-read of an authenticated non-delete event', async () => {
    const getCharge = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { response: { status: 404 } }))
    const { refresh, resourceStore } = deps({ getCharge })
    await expect(refresh(base)).rejects.toThrow('gone')
    expect(resourceStore.delete).not.toHaveBeenCalled()
  })

  it('still re-reads through the API for a non-delete action from an unauthenticated body', async () => {
    const getCharge = vi.fn().mockResolvedValue({ id: 'ch_1', amount: 100 })
    const { refresh, resourceStore } = deps({ getCharge })
    await refresh({ ...base, bodyAuthenticated: false })
    expect(getCharge).toHaveBeenCalledWith({ accessToken: 'tok' }, 'ch_1')
    expect(resourceStore.upsert).toHaveBeenCalledTimes(1)
  })

  it('skips unknown resourceType, empty id, unmapped slug, and missing method', async () => {
    const { refresh: r1, resourceStore: s1 } = deps({ getCharge: vi.fn() })
    await r1({ ...base, resourceType: 'unknown' })
    await r1({ ...base, resourceId: '' })
    expect(s1.upsert).not.toHaveBeenCalled()

    // unmapped slug
    const { refresh: r2, resourceStore: s2 } = deps({ getCharge: vi.fn() })
    await r2({ ...base, resourceType: 'mandates' })
    expect(s2.upsert).not.toHaveBeenCalled()

    // mapped slug but adapter lacks the method
    const { refresh: r3, resourceStore: s3 } = deps({})
    await r3(base)
    expect(s3.upsert).not.toHaveBeenCalled()
  })
})
