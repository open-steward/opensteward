/**
 * Tyms tax rates page by the caller's `page` and `limit`.
 *
 * `listTaxRates` called `GET /taxes` with no query at all, so page 2 was page
 * 1 again: the sync worker re-fetched the first page until its cap, and the
 * API served it forever. The rows were unwrapped from `res.data`, which on a
 * real response is the Laravel paginator object, not an array.
 *
 * Tyms documents paging once, site-wide
 * (https://tyms.readme.io/reference/authentication, "Pagination"):
 *
 *   `limit` — The number of records per page (default: 10)
 *   `page`  — The page number to retrieve
 *
 * and the `GET /taxes` 200 example (https://tyms.readme.io/reference/taxes)
 * is a Laravel length-aware paginator nested under `data`: `data.data` holds
 * the rows, `data.next_page_url` is null on the last page, `data.total` counts
 * every row, and `data.per_page` echoes the size served. No maximum `limit`
 * is documented.
 *
 * The fake upstream below honours only those two parameters, and answers in
 * the documented envelope. Its options model what the docs leave open: a
 * server that serves fewer or more rows a page than `limit` asks for, other
 * Laravel paginator shapes, and a list with no paginator at all.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TymsAdapter } from '../../../../../../src/verticals/accounting/adapters/tyms'
import { TymsClient } from '../../../../../../src/verticals/accounting/adapters/tyms/client'
import type {
  AccountingAdapter,
  Credentials,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new TymsAdapter({ apiKey: 'sk_test' })
/** The adapter as the router holds it, for `parseListQuery`. */
const routed: AccountingAdapter = adapter
const creds = { accessToken: 'sk_test' } as Credentials

afterEach(() => vi.restoreAllMocks())

interface FakeOptions {
  /** A server-side ceiling on `limit` that the docs do not mention. */
  cap?: number
  /** A server that pages at this size whatever `limit` asks for. */
  serves?: number
  /**
   * `per_page` and `total` as numeric strings. Laravel echoes `per_page`
   * from the request input, so it can arrive as one.
   */
  countsAsStrings?: boolean
  /**
   * `length-aware` is the documented paginator. `simple` is Laravel's
   * simplePaginate, which sends no `last_page` and no `total`.
   * `no-next-url` drops `next_page_url`, so only `current_page` and
   * `last_page` tell where the list ends.
   */
  shape?: 'length-aware' | 'simple' | 'no-next-url'
  /** A paginator with no `per_page`. */
  omitPerPage?: boolean
  /** A server that ignores `page` and serves page 1 every time. */
  ignoresPage?: boolean
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function taxRow(uuid: string, i: number) {
  return { uuid, name: `Tax ${i}`, percentage: 0.075, currency: 'NGN', is_deduction: false }
}

function taxRows(n: number) {
  return Array.from({ length: n }, (_, i) => taxRow(`tax-${String(i + 1).padStart(3, '0')}`, i + 1))
}

/** Every `GET /taxes` answered by `body(page, limit)`, with the calls recorded. */
function fakeBodies(body: (page: number, limit: number) => unknown) {
  const calls: Call[] = []
  vi.spyOn(TymsClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params: params === undefined ? undefined : { ...params } })
      if (path !== 'taxes') throw new Error(`unexpected path ${path}`)
      if (calls.length > 500) throw new Error('runaway walk: more than 500 requests')
      return body(Math.max(1, Number(params?.['page'] ?? 1)), Number(params?.['limit'] ?? 10))
    },
  )
  return calls
}

/** `GET /taxes` over `n` rows, honouring only the documented `page` and `limit`. */
function fakeTaxes(n: number, options: FakeOptions = {}) {
  const all = taxRows(n)
  const url = (p: number) => `https://api.tyms.io/api/v1/taxes?page=${p}`
  const count = (x: number) => (options.countsAsStrings ? String(x) : x)
  const calls = fakeBodies((askedPage, asked) => {
    const page = options.ignoresPage ? 1 : askedPage
    const perPage = options.serves ?? Math.min(asked, options.cap ?? Number.POSITIVE_INFINITY)
    const start = (page - 1) * perPage
    const rows = all.slice(start, start + perPage)
    const lastPage = Math.max(1, Math.ceil(n / perPage))
    const paginator: Record<string, unknown> = {
      current_page: page,
      data: rows,
      first_page_url: url(1),
      from: rows.length > 0 ? start + 1 : null,
      next_page_url: page < lastPage ? url(page + 1) : null,
      path: 'https://api.tyms.io/api/v1/taxes',
      per_page: count(perPage),
      prev_page_url: page > 1 ? url(page - 1) : null,
      to: rows.length > 0 ? start + rows.length : null,
    }
    if (options.shape !== 'simple') {
      paginator['last_page'] = lastPage
      paginator['last_page_url'] = url(lastPage)
      paginator['total'] = count(n)
    }
    if (options.shape === 'no-next-url') delete paginator['next_page_url']
    if (options.omitPerPage) delete paginator['per_page']
    return { status: 'success', message: 'Taxes retrieved successfully', data: paginator }
  })
  return { ids: all.map((r) => r.uuid), calls }
}

/** `GET /taxes` answering every request with all `n` rows and no paginator. */
function fakeWhole(n: number, shape: 'array' | 'flat') {
  const all = taxRows(n)
  const calls = fakeBodies(() => (shape === 'array' ? all : { status: 'success', data: all }))
  return { ids: all.map((r) => r.uuid), calls }
}

/** Pages 1..`pages` at `limit`, exactly as the sync worker asks for them. */
async function walkLikeTheWorker(limit: number, pages: number) {
  const ids: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await adapter.listTaxRates(creds, params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { ids, hasMore, totals }
}

describe('Tyms listTaxRates pages by the caller', () => {
  const L = 4

  it('serves N = 2L + 1 rows once each over pages 1, 2, 3, with hasMore from next_page_url', async () => {
    const upstream = fakeTaxes(2 * L + 1)

    const walk = await walkLikeTheWorker(L, 3)

    expect(walk.ids).toEqual(upstream.ids)
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('sends the documented page and limit, and page 2 carries page=2', async () => {
    const upstream = fakeTaxes(2 * L + 1)

    await walkLikeTheWorker(L, 2)

    expect(upstream.calls).toEqual([
      { path: 'taxes', params: { page: 1, limit: L } },
      { path: 'taxes', params: { page: 2, limit: L } },
    ])
  })

  it('ends exactly on N = 2L: a full page 2 reports hasMore false, not a guess', async () => {
    const upstream = fakeTaxes(2 * L)

    const walk = await walkLikeTheWorker(L, 2)

    expect(walk.ids).toEqual(upstream.ids)
    expect(walk.hasMore).toEqual([true, false])
  })

  it('passes a limit above any server ceiling through, reports the size served, and still serves every row', async () => {
    // No maximum is documented, so the adapter sends the caller's 500 as is.
    // A server that serves fewer says so in `per_page` — as a string, when
    // Laravel echoes the request input — and the page is judged at that size.
    const upstream = fakeTaxes(7, { cap: 3, countsAsStrings: true })

    const ids: Array<string | undefined> = []
    const reports = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listTaxRates(creds, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      reports.push(report)
      if (report?.hasMore === false) break
    }

    expect(ids).toEqual(upstream.ids)
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.map((r) => r?.pageSize)).toEqual([3, 3, 3])
    expect(reports.map((r) => r?.totalCount)).toEqual([7, 7, 7])
    expect(upstream.calls[0]).toEqual({ path: 'taxes', params: { page: 1, limit: 500 } })
  })

  it('reports no pageSize when the server served the size it was asked for', async () => {
    fakeTaxes(2 * L + 1)

    const params = withPageSink({ page: 1, limit: L })
    await adapter.listTaxRates(creds, params)

    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('sends the limit parseListQuery delivers, as a number', async () => {
    const upstream = fakeTaxes(2 * L + 1)

    const params = parseListQuery({ page: '2', limit: String(L) }, routed)
    const rows = await adapter.listTaxRates(creds, params)

    expect(upstream.calls).toEqual([{ path: 'taxes', params: { page: 2, limit: L } }])
    expect(rows.map((r) => r.id)).toEqual(upstream.ids.slice(L, 2 * L))
  })

  it('asks for page 1 at the adapter default when the caller names neither', async () => {
    const upstream = fakeTaxes(3)

    const rows = await adapter.listTaxRates(creds, {})

    expect(upstream.calls).toEqual([{ path: 'taxes', params: { page: 1, limit: 50 } }])
    expect(rows.map((r) => r.id)).toEqual(upstream.ids)
  })
})

describe('Tyms listTaxRates reads the end from whichever signal the paginator sends', () => {
  const L = 4

  it('falls back to current_page < last_page when there is no next_page_url', async () => {
    const upstream = fakeTaxes(2 * L + 1, { shape: 'no-next-url' })

    const walk = await walkLikeTheWorker(L, 3)

    expect(walk.ids).toEqual(upstream.ids)
    expect(walk.hasMore).toEqual([true, true, false])
  })

  it('reads next_page_url when there is no last_page or total (simplePaginate)', async () => {
    const upstream = fakeTaxes(2 * L + 1, { shape: 'simple' })

    const walk = await walkLikeTheWorker(L, 3)

    expect(walk.ids).toEqual(upstream.ids)
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.totals).toEqual([undefined, undefined, undefined])
  })
})

describe('Tyms listTaxRates on a server that serves more rows a page than limit asks for', () => {
  // The /taxes example shows per_page 20 against a documented default limit
  // of 10, so the docs cannot show that /taxes honours `limit`. If it does
  // not, upstream page N is not the caller's page N.

  it('serves every row once on the API path, 20-row upstream pages cut to 4', async () => {
    const upstream = fakeTaxes(45, { serves: 20 })

    const ids: Array<string | undefined> = []
    const metas = []
    for (let page = 1; page <= 12; page++) {
      const params = parseListQuery({ page: String(page), limit: '4' }, routed)
      const rows = await adapter.listTaxRates(creds, params)
      const envelope = listPage(rows, params, adapter.platform)
      ids.push(...envelope.data.map((r) => r.id))
      metas.push(envelope.meta)
    }

    expect(ids).toEqual(upstream.ids)
    expect(metas.map((m) => m.hasMore)).toEqual([...Array<boolean>(11).fill(true), false])
    expect(metas.map((m) => m.limit)).toEqual(Array<number>(12).fill(4))
  })

  it('reports hasMore itself, and ends exactly on an upstream page boundary', async () => {
    // No total, so the reported hasMore is all a walk has to stop on.
    const upstream = fakeTaxes(40, { serves: 20, shape: 'simple' })

    const walk = await walkLikeTheWorker(4, 10)

    expect(walk.ids).toEqual(upstream.ids)
    expect(walk.hasMore).toEqual([...Array<boolean>(9).fill(true), false])
    // Page 1 is cut from the page it asked for; every later page reads one
    // more upstream page, and none reads past the one that holds its rows.
    expect(upstream.calls).toHaveLength(1 + 2 * 9)
  })

  it('reads nothing past the last upstream page when the caller page runs off its end', async () => {
    const upstream = fakeTaxes(40, { serves: 20 })

    const params = withPageSink({ page: 6, limit: 7 })
    const rows = await adapter.listTaxRates(creds, params)

    expect(rows.map((r) => r.id)).toEqual(upstream.ids.slice(35, 40))
    expect(upstream.calls).toEqual([
      { path: 'taxes', params: { page: 6, limit: 7 } },
      { path: 'taxes', params: { page: 2, limit: 20 } },
    ])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, totalCount: 40 })
  })

  it('stops at a short upstream page when the paginator sends no end signal', async () => {
    // 25 rows, 20 a page, and neither next_page_url nor last_page.
    const all = taxRows(25)
    const calls = fakeBodies((page) => ({
      data: { current_page: page, data: all.slice((page - 1) * 20, page * 20), per_page: 20 },
    }))

    const rows = await adapter.listTaxRates(creds, withPageSink({ page: 2, limit: 15 }))

    expect(rows.map((r) => r.id)).toEqual(all.slice(15, 25).map((r) => r.uuid))
    expect(calls.map((c) => c.params)).toEqual([
      { page: 2, limit: 15 },
      { page: 1, limit: 20 },
    ])
  })

  it('page 1 is cut from the page already fetched, with no second request', async () => {
    const upstream = fakeTaxes(45, { serves: 20 })

    const rows = await adapter.listTaxRates(creds, withPageSink({ page: 1, limit: 4 }))

    expect(rows.map((r) => r.id)).toEqual(upstream.ids.slice(0, 4))
    expect(upstream.calls).toEqual([{ path: 'taxes', params: { page: 1, limit: 4 } }])
  })

  it('a page that straddles two upstream pages reads the other one at the served size', async () => {
    const upstream = fakeTaxes(45, { serves: 20 })

    const params = withPageSink({ page: 2, limit: 15 })
    const rows = await adapter.listTaxRates(creds, params)

    // Rows 15..29: the end of upstream page 1 and the start of page 2, which
    // was the page asked for first.
    expect(rows.map((r) => r.id)).toEqual(upstream.ids.slice(15, 30))
    expect(upstream.calls).toEqual([
      { path: 'taxes', params: { page: 2, limit: 15 } },
      { path: 'taxes', params: { page: 1, limit: 20 } },
    ])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, totalCount: 45 })
  })

  it('takes the served size from the rows when the paginator sends no per_page', async () => {
    const upstream = fakeTaxes(45, { serves: 20, omitPerPage: true })

    const rows = await adapter.listTaxRates(creds, withPageSink({ page: 2, limit: 4 }))

    expect(rows.map((r) => r.id)).toEqual(upstream.ids.slice(4, 8))
    expect(upstream.calls).toEqual([
      { path: 'taxes', params: { page: 2, limit: 4 } },
      { path: 'taxes', params: { page: 1, limit: 20 } },
    ])
  })
})

describe.each(['array', 'flat'] as const)(
  'Tyms listTaxRates on a %s list with no paginator',
  (shape) => {
    // A list without the paginator holds every row (a Laravel `->get()`), so
    // the caller's page is sliced out of it rather than served whole each time.
    it('serves every row once, with hasMore and the total', async () => {
      const upstream = fakeWhole(9, shape)

      const walk = await walkLikeTheWorker(4, 3)

      expect(walk.ids).toEqual(upstream.ids)
      expect(walk.hasMore).toEqual([true, true, false])
      expect(walk.totals).toEqual([9, 9, 9])
      expect(upstream.calls.map((c) => c.params)).toEqual([
        { page: 1, limit: 4 },
        { page: 2, limit: 4 },
        { page: 3, limit: 4 },
      ])
    })
  },
)

describe('Tyms tax rates on the API path', () => {
  it('parseListQuery → listTaxRates → listPage reports meta.hasMore and the total', async () => {
    const upstream = fakeTaxes(9)

    const metas = []
    const ids: Array<string | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '4' }, routed)
      const rows = await adapter.listTaxRates(creds, params)
      const envelope = listPage(rows, params, adapter.platform)
      ids.push(...envelope.data.map((r) => r.id))
      metas.push(envelope.meta)
    }

    expect(ids).toEqual(upstream.ids)
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([9, 9, 9])
    expect(metas.map((m) => m.limit)).toEqual([4, 4, 4])
  })

  it('a full last page is hasMore false, not null', async () => {
    fakeTaxes(8)

    const params = parseListQuery({ page: '2', limit: '4' }, routed)
    const envelope = listPage(await adapter.listTaxRates(creds, params), params, adapter.platform)

    expect(envelope.data).toHaveLength(4)
    expect(envelope.meta.hasMore).toBe(false)
  })

  it('judges a page the server shortened at the size it served', async () => {
    // Router default limit 100; a server that serves 3 must not read as the end.
    fakeTaxes(7, { cap: 3 })

    const params = parseListQuery({}, routed)
    const envelope = listPage(await adapter.listTaxRates(creds, params), params, adapter.platform)

    expect(envelope.data).toHaveLength(3)
    expect(envelope.meta.limit).toBe(3)
    expect(envelope.meta.hasMore).toBe(true)
  })
})

describe('Tyms getTaxRate', () => {
  it('walks every page until next_page_url is null to find a rate past page 1', async () => {
    // 120 rows: past the first page at the size getTaxRate asks for.
    const upstream = fakeTaxes(120)
    const last = upstream.ids[upstream.ids.length - 1]!

    const rate = await adapter.getTaxRate(creds, last)

    expect(rate.id).toBe(last)
    expect(upstream.calls.map((c) => c.params?.['page'])).toEqual([1, 2, 3])
  })

  it('stops at the page that holds the rate', async () => {
    const upstream = fakeTaxes(120)

    await adapter.getTaxRate(creds, upstream.ids[0]!)

    expect(upstream.calls).toEqual([{ path: 'taxes', params: { page: 1, limit: 50 } }])
  })

  it('reports not found only after the last page', async () => {
    const upstream = fakeTaxes(120)

    await expect(adapter.getTaxRate(creds, 'nope')).rejects.toThrow(/tax rate not found: nope/)
    expect(upstream.calls.map((c) => c.params?.['page'])).toEqual([1, 2, 3])
  })

  it('stops on page 2 when the server repeats page 1 instead of honouring page', async () => {
    const upstream = fakeTaxes(120, { ignoresPage: true })

    await expect(adapter.getTaxRate(creds, 'nope')).rejects.toThrow(/ignoring `page`/)
    expect(upstream.calls.map((c) => c.params?.['page'])).toEqual([1, 2])
  })

  it('stops at an empty page even when the paginator claims more', async () => {
    const calls = fakeBodies((page) => ({
      data: {
        current_page: page,
        data: page === 1 ? [taxRow('t-1', 1), taxRow('t-2', 2)] : [],
        next_page_url: 'https://api.tyms.io/api/v1/taxes?page=next',
      },
    }))

    await expect(adapter.getTaxRate(creds, 'nope')).rejects.toThrow(/tax rate not found: nope/)
    expect(calls).toHaveLength(2)
  })

  it('looks a rate up in one request when the list has no paginator', async () => {
    const upstream = fakeWhole(5, 'array')

    const rate = await adapter.getTaxRate(creds, upstream.ids[4]!)
    await expect(adapter.getTaxRate(creds, 'nope')).rejects.toThrow(/tax rate not found: nope/)

    expect(rate.id).toBe(upstream.ids[4])
    expect(upstream.calls).toHaveLength(2)
  })

  it('gives up after 200 pages of a paginator that never ends', async () => {
    // 200 stays under Tyms's documented 500 requests per minute per business.
    const calls = fakeBodies((page) => ({
      data: {
        current_page: page,
        data: [taxRow(`t-${page}`, page)],
        next_page_url: `https://api.tyms.io/api/v1/taxes?page=${page + 1}`,
      },
    }))

    await expect(adapter.getTaxRate(creds, 'nope')).rejects.toThrow(
      /nope not found in the first 200 pages/,
    )
    expect(calls).toHaveLength(200)
  })
})
