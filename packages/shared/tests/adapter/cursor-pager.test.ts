/**
 * The shared cursor pager: translate the sync worker's 1-based `page` into a
 * platform's opaque cursor chain.
 *
 * Moved out of `crm/hubspot/cursor-pager.ts` once a second vertical needed it.
 * Shopify pages by `page_info` from the Link header and ignored `page`, so a
 * collection over 250 rows re-fetched page one until the worker's
 * 10,000-page ceiling.
 *
 * The contract ported from HubSpot, generalised to any cursor type:
 *   - page N returns the Nth page, walking only as far as needed;
 *   - sequential access costs one request per page;
 *   - a cold jump walks; a page past the end is empty, not a loop;
 *   - keys isolate connections, collections AND query filters.
 * Plus what HubSpot's version got wrong:
 *   - the time-to-live slides with use, so a long sync does not go quadratic
 *     a minute in;
 *   - expired entries are pruned, so a long-running process does not grow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  _resetCursorPager,
  _cursorPagerSize,
} from '../../src/adapter/cursor-pager'

/** A 250-row collection served 100 at a time, cursor = next offset. */
function source(total: number, limit = 100) {
  const cursors: Array<string | undefined> = []
  const fetch = vi.fn(async (cursor: string | undefined) => {
    cursors.push(cursor)
    const start = cursor != null ? Number(cursor) : 0
    const items = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({
      id: String(start + i),
    }))
    const next = start + items.length
    return { items, next: next < total ? String(next) : undefined }
  })
  return { fetch, cursors }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.useRealTimers())

describe('pageByCursor', () => {
  it('returns different records for page 2 than page 1, and says whether more remain', async () => {
    const { fetch } = source(250)
    const p1 = await pageByCursor('k', 1, fetch)
    const p2 = await pageByCursor('k', 2, fetch)
    const p3 = await pageByCursor('k', 3, fetch)
    expect(p1.items[0]?.id).toBe('0')
    expect(p2.items[0]?.id).toBe('100')
    expect(p3.items).toHaveLength(50)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
  })

  it('costs one request per page on sequential access', async () => {
    const { fetch, cursors } = source(250)
    for (let p = 1; p <= 3; p++) await pageByCursor('k', p, fetch)
    expect(cursors).toEqual([undefined, '100', '200'])
  })

  it('walks to a page it has never seen', async () => {
    const { fetch, cursors } = source(250)
    const p3 = await pageByCursor('k', 3, fetch)
    expect(p3.items[0]?.id).toBe('200')
    expect(cursors).toEqual([undefined, '100', '200'])
  })

  it('answers a page past the end with nothing, rather than looping', async () => {
    const { fetch } = source(150)
    expect(await pageByCursor('k', 9, fetch)).toEqual({ items: [], hasMore: false })
  })

  it('answers a page past a walked end without another request', async () => {
    // Collections merge two endpoints page by page. Without this, the short
    // endpoint re-fetched its only page on every page of the long one.
    const { fetch, cursors } = source(150)
    await pageByCursor('k', 1, fetch)
    await pageByCursor('k', 2, fetch)
    expect(await pageByCursor('k', 3, fetch)).toEqual({ items: [], hasMore: false })
    expect(await pageByCursor('k', 7, fetch)).toEqual({ items: [], hasMore: false })
    expect(cursors).toEqual([undefined, '100'])
  })

  it('treats a missing or nonsense page as page 1', async () => {
    const { fetch, cursors } = source(250)
    await pageByCursor('k', undefined, fetch)
    await pageByCursor('k2', Number.NaN, fetch)
    await pageByCursor('k3', 0, fetch)
    expect(cursors).toEqual([undefined, undefined, undefined])
  })

  it('carries any cursor type, not just strings', async () => {
    type C = { batch: number; offset: number }
    const seen: Array<C | undefined> = []
    const fetch = async (c: C | undefined) => {
      seen.push(c)
      const at = c ?? { batch: 0, offset: 0 }
      return {
        items: [{ id: `${at.batch}:${at.offset}` }],
        next: at.batch < 1 ? { batch: at.batch + 1, offset: 0 } : undefined,
      }
    }
    const p2 = await pageByCursor<{ id: string }, C>('k', 2, fetch)
    expect(p2).toEqual({ items: [{ id: '1:0' }], hasMore: false })
    expect(seen).toEqual([undefined, { batch: 1, offset: 0 }])
  })

  it('keeps separate keys from reading each other’s cursors', async () => {
    const a = source(250)
    const b = source(250)
    await pageByCursor('shop-a::products', 1, a.fetch)
    const other = await pageByCursor('shop-b::products', 2, b.fetch)
    expect(other.items[0]?.id).toBe('100')
    expect(b.cursors).toEqual([undefined, '100'])
  })

  it('slides the time-to-live with use, so a long sync never re-walks', async () => {
    vi.useFakeTimers()
    const { fetch, cursors } = source(1000)
    for (let p = 1; p <= 5; p++) {
      await pageByCursor('k', p, fetch)
      vi.advanceTimersByTime(50_000) // each gap is under a minute; the total is not
    }
    expect(cursors).toHaveLength(5)
  })

  it('forgets a walk that stalled past the time-to-live', async () => {
    vi.useFakeTimers()
    const { fetch, cursors } = source(250)
    await pageByCursor('k', 1, fetch)
    vi.advanceTimersByTime(61_000)
    await pageByCursor('k', 2, fetch)
    expect(cursors).toEqual([undefined, undefined, '100'])
  })

  it('prunes expired entries instead of growing forever', async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 20; i++) await pageByCursor(`k${i}`, 1, source(10).fetch)
    expect(_cursorPagerSize()).toBe(20)
    vi.advanceTimersByTime(61_000)
    await pageByCursor('fresh', 1, source(10).fetch)
    expect(_cursorPagerSize()).toBe(1)
  })
})

describe('cursorPagerKey', () => {
  it('ignores the position params and key order', () => {
    expect(cursorPagerKey('s', '/p', { limit: 100, status: 'any', page: 3 })).toBe(
      cursorPagerKey('s', '/p', { status: 'any', limit: 100, page_info: 'x', cursor: 'y', after: 'z' }),
    )
  })

  it('separates filters, page sizes, scopes and collections', () => {
    const base = cursorPagerKey('s', '/p', { limit: 100 })
    expect(cursorPagerKey('s', '/p', { limit: 50 })).not.toBe(base)
    expect(cursorPagerKey('s', '/p', { limit: 100, status: 'open' })).not.toBe(base)
    expect(cursorPagerKey('t', '/p', { limit: 100 })).not.toBe(base)
    expect(cursorPagerKey('s', '/q', { limit: 100 })).not.toBe(base)
  })

  it('treats a Date filter by its instant', () => {
    const at = '2026-09-13T00:00:00.000Z'
    expect(cursorPagerKey('s', '/p', { updatedAfter: new Date(at) })).toBe(
      cursorPagerKey('s', '/p', { updatedAfter: new Date(at) }),
    )
  })
})

describe('connectionScope', () => {
  const org = 'salesforce:https://acme.my.salesforce.com'

  it('separates two connections to one account', () => {
    const a = connectionScope(org, { accessToken: 'at-a', refreshToken: 'rt-a' })
    const b = connectionScope(org, { accessToken: 'at-b', refreshToken: 'rt-b' })
    expect(a).not.toBe(b)
    expect(a.startsWith(`${org}#`)).toBe(true)
  })

  it('outlives an access-token refresh when there is a refresh token', () => {
    expect(connectionScope(org, { accessToken: 'at-1', refreshToken: 'rt' })).toBe(
      connectionScope(org, { accessToken: 'at-2', refreshToken: 'rt' }),
    )
    // Without one, the access token is what tells two connections apart.
    expect(connectionScope(org, { accessToken: 'x' })).not.toBe(
      connectionScope(org, { accessToken: 'y' }),
    )
  })

  it('never carries a token, only 16 hex digits of a hash', () => {
    const scope = connectionScope(org, { accessToken: 'secret-at', refreshToken: 'secret-rt' })
    expect(scope).not.toContain('secret')
    expect(scope.slice(org.length)).toMatch(/^#[0-9a-f]{16}$/)
  })
})
