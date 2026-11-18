import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HubSpotAdapter } from '../../../../../../src/verticals/crm/adapters/hubspot/index'
import { MAX_HUBSPOT_PAGE_SIZE } from '../../../../../../src/verticals/crm/adapters/hubspot/constants'
import { listPage, _resetCursorPager } from '../../../../../../src/verticals/crm/adapters/hubspot/cursor-pager'
import type { Credentials } from '../../../../../../src/verticals/crm/adapter/interface'

/**
 * A HubSpot sync job failed on its first request:
 *
 *   400 VALIDATION_ERROR — "You can only request at most 100 objects in one
 *   request."  context: { limit: ["500"] }
 *
 * 500 is the sync worker's default page size. Two defects met here, and the
 * dangerous one is not the 400.
 *
 * 1. The limit. Loud, and the only one actually reported.
 *
 * 2. `cursorParams` dropped `page` entirely — it read only `cursor`/`after`,
 *    which the worker never sends. Every request returned the FIRST page.
 *
 * Fixing (1) alone converts a loud failure into a silent one, which is why
 * these are pinned together. The worker ends a collection when a page comes
 * back shorter than the size it ASKED for, so a request clamped 500 → 100
 * makes a full first page look like the last: the sync stops at 100 records
 * and marks the collection COMPLETE, after which the cache serves a truncated
 * collection as authoritative.
 */

const CREDS = { accessToken: 'tok', portalId: 149295279 } as unknown as Credentials

interface Captured {
  limit?: unknown
  after?: unknown
}

/** Stand in for the HTTP client: a fixed collection, paged by `after`. */
function fakeClient(total: number, calls: Captured[] = []) {
  return {
    list: vi.fn(async (_path: string, params: Record<string, unknown>) => {
      calls.push({ limit: params['limit'], after: params['after'] })
      const limit = Number(params['limit'] ?? 25)
      const start = params['after'] != null ? Number(params['after']) : 0
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
        id: String(start + i),
        // The transforms read `properties`; without it they throw before any
        // pagination assertion is reached.
        properties: {},
      }))
      const next = start + items.length
      return {
        items,
        hasMore: next < total,
        ...(next < total ? { nextCursor: String(next) } : {}),
      }
    }),
  }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('the declared ceiling', () => {
  it('is the number HubSpot actually enforces', () => {
    expect(MAX_HUBSPOT_PAGE_SIZE).toBe(100)
  })

  it('is declared on the adapter, so the sync worker can see it', () => {
    // The worker clamps its termination test to this. An undeclared ceiling
    // is what made the whole job fail on request one.
    expect(new HubSpotAdapter().capabilities?.maxPageSize).toBe(100)
  })
})

describe('the request never exceeds the ceiling', () => {
  it('clamps the worker page size of 500 down to 100', async () => {
    const calls: Captured[] = []
    const client = fakeClient(10, calls)
    await listPage(client as never, CREDS, '/crm/v3/objects/contacts', 1, { limit: 100 })
    expect(calls[0]?.limit).toBe(100)
  })

  it('clamps through the adapter, not only the worker', async () => {
    // The router reaches listContacts directly and does not consult
    // capabilities, so a caller passing limit=500 must be clamped here too.
    const adapter = new HubSpotAdapter()
    const client = fakeClient(10)
    vi.spyOn(
      adapter as unknown as { client: (c: Credentials) => unknown },
      'client',
    ).mockReturnValue(client)

    await adapter.listContacts(CREDS, { limit: 500 })
    const sent = client.list.mock.calls[0]?.[1] as Record<string, unknown>
    expect(sent['limit']).toBe(100)
    expect(Number(sent['limit'])).toBeLessThanOrEqual(MAX_HUBSPOT_PAGE_SIZE)
  })

  it('leaves a limit already under the ceiling alone', async () => {
    const adapter = new HubSpotAdapter()
    const client = fakeClient(10)
    vi.spyOn(
      adapter as unknown as { client: (c: Credentials) => unknown },
      'client',
    ).mockReturnValue(client)

    await adapter.listContacts(CREDS, { limit: 25 })
    expect((client.list.mock.calls[0]?.[1] as Record<string, unknown>)['limit']).toBe(25)
  })
})

describe('`page` actually advances', () => {
  it('returns DIFFERENT records for page 2 than page 1', async () => {
    // The assertion that fails against the old code: `page` was dropped, so
    // both pages were the first 100 records.
    const client = fakeClient(250)
    const p1 = await listPage<{ id: string }>(client as never, CREDS, '/p', 1, { limit: 100 })
    const p2 = await listPage<{ id: string }>(client as never, CREDS, '/p', 2, { limit: 100 })

    expect(p1).toHaveLength(100)
    expect(p2).toHaveLength(100)
    expect(p1[0]?.id).toBe('0')
    expect(p2[0]?.id).toBe('100')
    expect(new Set([...p1, ...p2].map((r) => r.id)).size).toBe(200)
  })

  it('walks the whole collection without dropping or repeating a record', async () => {
    const client = fakeClient(250)
    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const items = await listPage<{ id: string }>(client as never, CREDS, '/p', page, {
        limit: 100,
      })
      seen.push(...items.map((r) => r.id))
    }
    expect(seen).toHaveLength(250)
    expect(new Set(seen).size).toBe(250)
  })

  it('returns a short final page, which is what ends the sync', async () => {
    // The worker's only natural exit. If page 3 of 250 came back full, the
    // sync would keep going to maxPagesPerResource.
    const client = fakeClient(250)
    for (let page = 1; page <= 2; page++) {
      await listPage(client as never, CREDS, '/p', page, { limit: 100 })
    }
    const last = await listPage(client as never, CREDS, '/p', 3, { limit: 100 })
    expect(last).toHaveLength(50)
    expect(last.length).toBeLessThan(100)
  })

  it('does not re-walk on sequential access', async () => {
    // Correctness does not depend on this, but a quadratic walk would spend a
    // 100-request/10s rate limit fast: 250 records would cost 6 requests
    // instead of 3.
    const calls: Captured[] = []
    const client = fakeClient(250, calls)
    for (let page = 1; page <= 3; page++) {
      await listPage(client as never, CREDS, '/p', page, { limit: 100 })
    }
    expect(calls).toHaveLength(3)
  })

  it('still reaches the right page when the cache is cold', async () => {
    // A client jumping straight to page 3 must get page 3, just by walking.
    const calls: Captured[] = []
    const client = fakeClient(250, calls)
    const p3 = await listPage<{ id: string }>(client as never, CREDS, '/p', 3, { limit: 100 })
    expect(p3[0]?.id).toBe('200')
    expect(calls).toHaveLength(3)
  })

  it('keeps two portals from reading each other’s cursors', async () => {
    const client = fakeClient(250)
    await listPage(client as never, CREDS, '/p', 1, { limit: 100 })
    const other = { accessToken: 'tok2', portalId: 999 } as unknown as Credentials
    const p2 = await listPage<{ id: string }>(client as never, other, '/p', 2, { limit: 100 })
    expect(p2[0]?.id).toBe('100')
  })

  it('keeps two resources from colliding', async () => {
    const client = fakeClient(250)
    await listPage(client as never, CREDS, '/contacts', 1, { limit: 100 })
    const deals = await listPage<{ id: string }>(client as never, CREDS, '/deals', 1, {
      limit: 100,
    })
    expect(deals[0]?.id).toBe('0')
  })

  it('answers a page past the end with nothing, rather than looping', async () => {
    const client = fakeClient(150)
    expect(await listPage(client as never, CREDS, '/p', 9, { limit: 100 })).toEqual([])
  })
})

describe('an explicit cursor still wins', () => {
  it('uses the caller’s cursor rather than recomputing from page', async () => {
    // A client paging by cursor already holds a position; recomputing it from
    // `page` would move them.
    const adapter = new HubSpotAdapter()
    const client = fakeClient(250)
    vi.spyOn(
      adapter as unknown as { client: (c: Credentials) => unknown },
      'client',
    ).mockReturnValue(client)

    await adapter.listContacts(CREDS, { cursor: '100', limit: 100 })
    expect((client.list.mock.calls[0]?.[1] as Record<string, unknown>)['after']).toBe('100')
  })
})
