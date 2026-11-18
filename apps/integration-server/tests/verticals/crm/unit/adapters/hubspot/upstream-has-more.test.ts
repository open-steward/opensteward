/**
 * HubSpot now reports through the page sink whether more rows remain, so the
 * sync worker ends a collection on HubSpot's word (`paging.next`) rather than
 * guessing from a short page. Its cursor walk moved to the shared pager; the
 * behaviour pinned in `pagination.test.ts` is unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import { HubSpotAdapter } from '../../../../../../src/verticals/crm/adapters/hubspot/index'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

const CREDS = { accessToken: 'tok', portalId: 149295279 } as unknown as Credentials

function fakeClient(total: number) {
  return {
    list: vi.fn(async (_path: string, params: Record<string, unknown>) => {
      const limit = Number(params['limit'] ?? 25)
      const start = params['after'] != null ? Number(params['after']) : 0
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
        id: String(start + i),
        properties: {},
      }))
      const next = start + items.length
      return { items, hasMore: next < total, ...(next < total ? { nextCursor: String(next) } : {}) }
    }),
  }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

function adapterWith(client: ReturnType<typeof fakeClient>) {
  const adapter = new HubSpotAdapter()
  vi.spyOn(adapter as unknown as { client: (c: Credentials) => unknown }, 'client').mockReturnValue(client)
  return adapter
}

describe('HubSpot reports hasMore', () => {
  it('true on every page but the last, when paging by number', async () => {
    const adapter = adapterWith(fakeClient(250))
    const seen: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 100 })
      await adapter.listContacts(CREDS, params)
      seen.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual([true, true, false])
  })

  it('false on a full final page, so an exact multiple costs no extra request', async () => {
    const client = fakeClient(200)
    const adapter = adapterWith(client)
    const params = withPageSink({ page: 2, limit: 100 })
    const items = await adapter.listContacts(CREDS, params)
    expect(items).toHaveLength(100)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('from the response when the caller pages by explicit cursor', async () => {
    const adapter = adapterWith(fakeClient(250))
    const params = withPageSink({ cursor: '200', limit: 100 })
    await adapter.listContacts(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
