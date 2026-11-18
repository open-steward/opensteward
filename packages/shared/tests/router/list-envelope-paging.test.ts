import { describe, it, expect, beforeEach } from 'vitest'
import { parseListQuery, listPage } from '../../src/router/list-envelope'
import { reportUpstreamPage, withPageSink } from '../../src/adapter/page-meta'
import { pageByCursor, cursorPagerKey, _resetCursorPager } from '../../src/adapter/cursor-pager'

/**
 * The router asked every adapter for limit + 1 and dropped the extra row to
 * decide hasMore. Any upstream that positions the next page from what it was
 * sent — a cursor minted after the extra row, an offset computed from the
 * inflated limit — lost that row at every page boundary (measured: 35 of 38).
 */
const ALL = Array.from({ length: 38 }, (_, i) => i + 1)

async function walk(fetch: (p: ReturnType<typeof parseListQuery>) => Promise<number[]>) {
  const served: number[] = []
  const hasMore: Array<boolean | null> = []
  const sizes: number[] = []
  for (let page = 1; page <= 10; page++) {
    const params = parseListQuery({ limit: '10', page: String(page) })
    const env = listPage(await fetch(params), params, 'x')
    served.push(...env.data)
    hasMore.push(env.meta.hasMore)
    sizes.push(env.data.length)
    if (env.meta.hasMore === false) break
  }
  return { served, hasMore, sizes }
}

// Pages of exactly the caller's 10. `served` alone cannot catch a router that
// inflates `limit` AND reports the inflated value: it hands out every row
// exactly once, in pages of 11 the caller never asked for.
const CALLER_SIZED_PAGES = [10, 10, 10, 8]

beforeEach(() => _resetCursorPager())

describe('the router asks for exactly the caller’s limit', () => {
  it('serves every row of an offset upstream exactly once', async () => {
    const { served, sizes } = await walk(async (p) =>
      ALL.slice(((p.page ?? 1) - 1) * p.limit!, (p.page ?? 1) * p.limit!),
    )
    expect(served).toEqual(ALL)
    expect(sizes).toEqual(CALLER_SIZED_PAGES)
  })

  it('serves every row of a cursor upstream exactly once, with exact hasMore', async () => {
    const { served, hasMore, sizes } = await walk(async (p) => {
      const r = await pageByCursor<number, number>(
        cursorPagerKey('s', '/p', { limit: p.limit }),
        p.page,
        async (start = 0) => {
          const end = start + p.limit!
          return { items: ALL.slice(start, end), next: end < ALL.length ? end : undefined }
        },
      )
      reportUpstreamPage(p, { hasMore: r.hasMore })
      return r.items
    })
    expect(served).toEqual(ALL)
    expect(hasMore).toEqual([true, true, true, false])
    expect(sizes).toEqual(CALLER_SIZED_PAGES)
  })

  it('clamps limit into [1, 500] and never sends 0 or a negative', () => {
    expect(parseListQuery({ limit: '25' }).limit).toBe(25)
    expect(parseListQuery({}).limit).toBe(100)
    expect(parseListQuery({ limit: '900' }).limit).toBe(500)
    expect(parseListQuery({ limit: '0' }).limit).toBe(1)
    // `asked || 1` would pass every line above and still send -5 upstream.
    expect(parseListQuery({ limit: '-5' }).limit).toBe(1)
    expect(parseListQuery({ limit: 'abc' }).limit).toBe(100)
  })

  it('lets an API walk and a sync share cursor positions without skipping or repeating', async () => {
    // With no probe, an API walk at limit=10 and a sync at pageSize 10 build the
    // SAME cursor-pager key, so each resumes from positions the other minted.
    // A position minted at the same size is the same position — this pins it,
    // interleaving the two with the sync running a page ahead.
    const fetchPage = async (p: { page?: number; limit?: number }) => {
      const r = await pageByCursor<number, number>(
        cursorPagerKey('s', '/p', { limit: p.limit }),
        p.page,
        async (start = 0) => {
          const end = start + p.limit!
          return { items: ALL.slice(start, end), next: end < ALL.length ? end : undefined }
        },
      )
      return r.items
    }
    const api: number[] = []
    const sync: number[] = []
    sync.push(...(await fetchPage(withPageSink({ page: 1, limit: 10 }))))
    for (let page = 1; page <= 4; page++) {
      if (page < 4) sync.push(...(await fetchPage(withPageSink({ page: page + 1, limit: 10 }))))
      api.push(...(await fetchPage(parseListQuery({ limit: '10', page: String(page) }))))
    }
    expect(api).toEqual(ALL)
    expect(sync).toEqual(ALL)
  })

  it('adds no enumerable key an adapter could spread into a query string', () => {
    expect(Object.keys(parseListQuery({ limit: '5' })).sort()).toEqual([
      'limit',
      'page',
      'search',
      'updatedAfter',
    ])
  })
})
