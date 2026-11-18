import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAGE_LIMIT,
  collectionIsComplete,
  listPage,
  pageLocally,
  pageOffset,
  parseListQuery,
} from '../../src/router/list-envelope'
import {
  declaredPageMax,
  readUpstreamPage,
  reportUpstreamPage,
  withPageSink,
} from '../../src/adapter/page-meta'
import type { QueryParams } from '../../src/adapter/base'

/**
 * `parseListQuery` builds the params every list route hands its adapter, and
 * `listPage` / `collectionIsComplete` judge the result against `params.limit`.
 * Two gaps let those judgements go wrong on the API path:
 *
 *   - An adapter that clamps to its platform's maximum returned fewer rows than
 *     the limit the router asked for. Paysafe's maximum is 50 and the default
 *     limit is 100: 50 < 100 read as a short page, so `meta.hasMore` was
 *     `false` and the cache stored 50 rows as the WHOLE collection. The
 *     declared `capabilities.maxPageSize` — which the sync worker already
 *     honours — never reached the router.
 *   - `page` was not normalised. `0` and `-3` were echoed as `meta.page`, and
 *     with a reported total `page × limit < total` said there was more even
 *     though the adapter had served the whole collection as page 1.
 */

const withMax = (maxPageSize: number) => ({ capabilities: { maxPageSize } })

describe('parseListQuery clamps limit to the adapter’s declared page maximum', () => {
  it('asks a 50-row platform for 50, not the default 100', () => {
    expect(parseListQuery({}, withMax(50)).limit).toBe(50)
    expect(parseListQuery({ limit: '100' }, withMax(50)).limit).toBe(50)
  })

  it('leaves a limit under the maximum alone', () => {
    expect(parseListQuery({ limit: '20' }, withMax(50)).limit).toBe(20)
    expect(parseListQuery({ limit: '50' }, withMax(50)).limit).toBe(50)
  })

  it('changes nothing without an adapter, capabilities or a declared maximum', () => {
    for (const adapter of [undefined, {}, { capabilities: {} }]) {
      expect(parseListQuery({}, adapter).limit).toBe(100)
      expect(parseListQuery({ limit: '25' }, adapter).limit).toBe(25)
      expect(parseListQuery({ limit: '900' }, adapter).limit).toBe(500)
    }
  })

  it.each([
    ['0', 0],
    ['NaN', Number.NaN],
    ['negative', -5],
    ['fractional', 50.5],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('ignores a %s declaration', (_label, max) => {
    expect(parseListQuery({}, withMax(max)).limit).toBe(100)
    expect(parseListQuery({ limit: '30' }, withMax(max)).limit).toBe(30)
  })

  it('keeps the router’s own 500 ceiling under a larger platform maximum', () => {
    expect(parseListQuery({ limit: '900' }, withMax(1000)).limit).toBe(500)
  })

  it('adds no enumerable key when an adapter is passed', () => {
    // Adapters spread params into upstream query strings.
    expect(Object.keys(parseListQuery({ limit: '5' }, withMax(50))).sort()).toEqual([
      'limit',
      'page',
      'search',
      'updatedAfter',
    ])
  })
})

describe('parseListQuery normalises page', () => {
  it.each(['0', '-3', 'abc', ''])('reads page %j as the first page', (page) => {
    expect(parseListQuery({ page }).page).toBeUndefined()
  })

  it('reads a missing page as the first page', () => {
    expect(parseListQuery({}).page).toBeUndefined()
  })

  it('floors a fractional page', () => {
    expect(parseListQuery({ page: '2.7' }).page).toBe(2)
  })

  it('keeps a valid page', () => {
    expect(parseListQuery({ page: '2' }).page).toBe(2)
  })

  it.each(['0', '-3', 'abc'])(
    'page %j is page 1 in meta, and a reported total of one page has no more',
    (page) => {
      const params = parseListQuery({ page, limit: '10' })
      reportUpstreamPage(params, { totalCount: 10 })
      const env = listPage(
        Array.from({ length: 10 }, (_, i) => i),
        params,
        'x',
      )
      expect(env.meta.page).toBe(1)
      expect(env.meta.hasMore).toBe(false)
    },
  )
})

describe('a clamped adapter is judged against the limit it was actually asked for', () => {
  const MAX = 50
  const UPSTREAM = Array.from({ length: 120 }, (_, i) => ({ id: `r${i + 1}` }))
  const adapter = withMax(MAX)

  // Like paysafe: sends at most its platform maximum and reports no total.
  const fetchPage = (params: QueryParams) => {
    const size = Math.min(params.limit ?? 100, MAX)
    const start = pageOffset(params, size)
    return UPSTREAM.slice(start, start + size)
  }

  it('reports the served limit and does not call a full clamped page the last', () => {
    const params = parseListQuery({}, adapter)
    const env = listPage(fetchPage(params), params, 'paysafe')
    expect(env.data).toHaveLength(50)
    expect(env.meta.limit).toBe(50)
    expect(env.meta.hasMore).not.toBe(false)
    expect(env.meta.hasMore).toBeNull()
  })

  it('walks every row exactly once at the served limit', () => {
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 5; page++) {
      const params = parseListQuery({ page: String(page) }, adapter)
      const env = listPage(fetchPage(params), params, 'paysafe')
      served.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
      if (env.meta.hasMore === false) break
    }
    expect(served).toEqual(UPSTREAM.map((r) => r.id))
    expect(hasMore).toEqual([null, null, false])
  })

  it('never calls a full clamped page the complete collection', () => {
    const params = parseListQuery({}, adapter)
    expect(collectionIsComplete(params, fetchPage(params))).toBe(false)
  })

  it('still calls a genuinely short page complete', () => {
    const params = parseListQuery({}, adapter)
    expect(collectionIsComplete(params, UPSTREAM.slice(0, 30))).toBe(true)
  })
})

describe('parseListQuery reads page as a whole decimal number', () => {
  // parseInt read the leading digits of anything: '2abc' was page 2 and '1e3'
  // page 1. A huge page passed straight through, and offset adapters then
  // sent `(page − 1) × limit` upstream in exponent notation.
  it.each(['2abc', '1e3', '0x10', '1,2', '+2', '99999999999999999999'])(
    'reads page %j as the first page',
    (page) => {
      expect(parseListQuery({ page }).page).toBeUndefined()
    },
  )

  it('keeps page 1 as 1', () => {
    expect(parseListQuery({ page: '1' }).page).toBe(1)
  })

  it('floors a fractional page rather than truncating its text', () => {
    expect(parseListQuery({ page: '3.99' }).page).toBe(3)
  })

  it('ignores surrounding whitespace', () => {
    expect(parseListQuery({ page: ' 3 ' }).page).toBe(3)
  })
})

describe('listPage reports the page it served, whoever built the params', () => {
  // parseListQuery normalises page, but listPage is exported and a caller that
  // builds params by hand got `meta.page: 0` back, and with a reported total
  // `0 × limit < total` claimed more after the adapter served everything.
  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])('reads page %s as page 1', (page) => {
    const params = withPageSink({ page, limit: 10 })
    reportUpstreamPage(params, { totalCount: 10 })
    const env = listPage(
      Array.from({ length: 10 }, (_, i) => i),
      params,
      'x',
    )
    expect(env.meta.page).toBe(1)
    expect(env.meta.hasMore).toBe(false)
  })

  it('floors a fractional page', () => {
    const env = listPage([1], withPageSink({ page: 2.5, limit: 10 }), 'x')
    expect(env.meta.page).toBe(2)
  })
})

describe('collectionIsComplete takes the adapter’s word that more rows exist', () => {
  // otto-market's shipments endpoint serves at most 25 rows and reports
  // `hasMore` from the upstream's rel:next. Against the router's limit of 100
  // those 25 rows read as a short page, so the response said `hasMore: true`
  // while the cache stored the 25 rows as the whole collection — and every
  // later unfiltered read served them with `hasMore: false`.
  it('never calls a page complete that the adapter said has more', () => {
    const params = parseListQuery({})
    reportUpstreamPage(params, { hasMore: true })
    const rows = Array.from({ length: 25 }, (_, i) => i)
    expect(listPage(rows, params, 'otto-market').meta.hasMore).toBe(true)
    expect(collectionIsComplete(params, rows)).toBe(false)
  })

  it('still lets a reported total decide first, as listPage does', () => {
    const params = parseListQuery({ limit: '10' })
    reportUpstreamPage(params, { totalCount: 5, hasMore: true })
    const rows = [1, 2, 3, 4, 5]
    expect(listPage(rows, params, 'x').meta.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
  })

  it('treats a reported hasMore: false on a short page as complete', () => {
    const params = parseListQuery({})
    reportUpstreamPage(params, { hasMore: false })
    expect(collectionIsComplete(params, [1, 2, 3])).toBe(true)
  })
})

describe('declaredPageMax is the one reading of capabilities.maxPageSize', () => {
  it('returns a finite integer ≥ 1 and nothing else', () => {
    expect(declaredPageMax(withMax(50))).toBe(50)
    expect(declaredPageMax(withMax(1))).toBe(1)
    for (const bad of [0, -5, 50.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(declaredPageMax(withMax(bad))).toBeUndefined()
    }
    expect(declaredPageMax(undefined)).toBeUndefined()
    expect(declaredPageMax({})).toBeUndefined()
    expect(declaredPageMax({ capabilities: {} })).toBeUndefined()
  })
})

describe('a method that asks the platform for fewer rows than params.limit says so', () => {
  // One adapter-wide `maxPageSize` cannot describe an adapter whose endpoints
  // have different ceilings: JD.com's refunds take 50 and its promotions 10,
  // otto-market's shipments 25 and its orders 128. The router asked for the
  // declared (or default) limit, the method sent its own smaller ceiling, and
  // the full page read as the last one. Reporting `pageSize` makes the router
  // judge the page — and report `meta.limit` — at the size actually asked for.
  const UPSTREAM = Array.from({ length: 60 }, (_, i) => i + 1)
  const fetch10 = (params: QueryParams) => {
    const size = Math.min(params.limit ?? 50, 10)
    reportUpstreamPage(params, { pageSize: size })
    const start = pageOffset(params, size)
    return UPSTREAM.slice(start, start + size)
  }

  it('reports the served size in meta.limit and does not call a full page the last', () => {
    const params = parseListQuery({}, withMax(50))
    const env = listPage(fetch10(params), params, 'jdcom')
    expect(env.data).toHaveLength(10)
    expect(env.meta.limit).toBe(10)
    expect(env.meta.hasMore).toBeNull()
    expect(collectionIsComplete(params, fetch10(parseListQuery({}, withMax(50))))).toBe(false)
  })

  it('walks every row once, page by page at the served size', () => {
    const served: number[] = []
    for (let page = 1; page <= 10; page++) {
      const params = parseListQuery({ page: String(page) }, withMax(50))
      const env = listPage(fetch10(params), params, 'jdcom')
      served.push(...env.data)
      if (env.meta.hasMore === false) break
    }
    expect(served).toEqual(UPSTREAM)
  })

  it('still ends the collection on a short page', () => {
    const params = parseListQuery({ page: '7' }, withMax(50))
    const rows = fetch10(params)
    expect(rows).toEqual([])
    expect(listPage(rows, params, 'jdcom').meta.hasMore).toBe(false)
    const first = withPageSink({ limit: 50 })
    reportUpstreamPage(first, { pageSize: 10 })
    expect(collectionIsComplete(first, [1, 2, 3])).toBe(true)
  })

  it('ignores a reported size that is not smaller than the limit, or not a whole number', () => {
    for (const pageSize of [100, 250, 0, -1, 2.5, Number.NaN]) {
      const params = parseListQuery({})
      reportUpstreamPage(params, { pageSize })
      expect(listPage([1, 2, 3], params, 'x').meta.limit).toBe(100)
    }
  })
})

describe('pageLocally serves one caller page of a list the platform returns whole', () => {
  const ALL = Array.from({ length: 23 }, (_, i) => i + 1)

  it('slices at page and limit, and reports the total', () => {
    const params = parseListQuery({ page: '2', limit: '10' })
    expect(pageLocally(ALL, params)).toEqual(ALL.slice(10, 20))
    const env = listPage(pageLocally(ALL, params), params, 'x')
    expect(env.meta.totalCount).toBe(23)
    expect(env.meta.hasMore).toBe(true)
  })

  it('reaches every row once, and the last page says so', () => {
    const served: number[] = []
    const more: Array<boolean | null> = []
    for (let page = 1; page <= 5; page++) {
      const params = parseListQuery({ page: String(page), limit: '10' })
      const env = listPage(pageLocally(ALL, params), params, 'x')
      served.push(...env.data)
      more.push(env.meta.hasMore)
      if (env.meta.hasMore === false) break
    }
    expect(served).toEqual(ALL)
    expect(more).toEqual([true, true, false])
  })

  it('reports hasMore for the sync worker, which stops on it', () => {
    const params = withPageSink({ page: 3, limit: 10 })
    pageLocally(ALL, params)
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: false,
      totalCount: 23,
      pagedLocally: true,
    })
  })

  it('lets a cache store the first page only when it holds every row', () => {
    const small = parseListQuery({})
    expect(collectionIsComplete(small, pageLocally(ALL, small))).toBe(true)
    const paged = parseListQuery({ limit: '10' })
    expect(collectionIsComplete(paged, pageLocally(ALL, paged))).toBe(false)
  })

  // Ported from the row pager's copy of this helper, which it replaced: the
  // same slice, total and end at every size, page and limit.
  const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)
  // More rows than the router's default page: a no-limit call capped at
  // DEFAULT_PAGE_LIMIT (the row pager's rule) cannot pass for "every row".
  const MANY = range(DEFAULT_PAGE_LIMIT + 10)

  it('returns every row to a caller that named no limit, and reports the end', () => {
    const params = withPageSink({})
    expect(pageLocally(MANY, params)).toEqual(MANY)
    expect(readUpstreamPage(params)).toEqual({
      totalCount: MANY.length,
      hasMore: false,
      pagedLocally: true,
    })
  })

  it('is the slice [(page-1)×limit, page×limit), with an exact total and hasMore', () => {
    for (let n = 0; n <= 30; n++) {
      const all = range(n)
      for (let limit = 1; limit <= 12; limit++) {
        for (let page = 1; page <= Math.ceil(n / limit) + 2; page++) {
          const params = withPageSink({ page, limit })
          const out = pageLocally(all, params)
          const ctx = `n ${n} limit ${limit} page ${page}`
          expect(out, ctx).toEqual(all.slice((page - 1) * limit, page * limit))
          const reported = readUpstreamPage(params)
          expect(reported?.totalCount, ctx).toBe(n)
          expect(reported?.hasMore, ctx).toBe(n > page * limit)
          expect(reported?.pagedLocally, ctx).toBe(true)
        }
      }
    }
  })

  it("takes the caller's page and limit from parseListQuery, and the envelope reports the end", () => {
    const params = parseListQuery({ limit: '5', page: '5' })
    const out = pageLocally(range(23), params)
    expect(out).toEqual([20, 21, 22])
    const env = listPage(out, params, 'fixture')
    expect(env.meta).toMatchObject({ totalCount: 23, hasMore: false, page: 5, limit: 5 })
  })

  it('a missing, zero or negative page is page 1, and a fractional limit is floored', () => {
    const all = range(20)
    for (const page of [undefined, 0, -2, Number.NaN])
      expect(pageLocally(all, { page, limit: 3 })).toEqual([0, 1, 2])
    // 2.9 is 2: page 2 is rows 2 and 3, not a slice starting at row 2.9.
    expect(pageLocally(range(5), { page: 2, limit: 2.9 })).toEqual([2, 3])
  })

  it('a limit that is not a number >= 1 names no page size: every row, and the end', () => {
    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const params = withPageSink({ limit })
      expect(pageLocally(MANY, params), String(limit)).toEqual(MANY)
      expect(readUpstreamPage(params), String(limit)).toEqual({
        totalCount: MANY.length,
        hasMore: false,
        pagedLocally: true,
      })
    }
  })

  it('never leaks its report into the params an adapter forwards upstream', () => {
    const params: QueryParams = withPageSink({ page: 1, limit: 2 })
    pageLocally([1, 2, 3], params)
    expect(Object.keys(params)).toEqual(['page', 'limit'])
    expect(JSON.stringify(params)).toBe('{"page":1,"limit":2}')
  })
})
