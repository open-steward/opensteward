/**
 * Lumin Sign list paging: 1-based `page` + caller's `limit` → Lumin's
 * `page` + `limit` on GET /templates.
 *
 * Lumin's `limit` is an enum, not a range:
 * https://developers.luminpdf.com/tabs/api-reference/api/templates/list-templates.md
 *   page:  "Specify which page of the dataset to return (min = 1)."
 *   limit: "Specify how many templates to return: one of 10, 25, 50."
 *
 * So a caller limit outside {10, 25, 50} cannot be forwarded. The adapter reads
 * the smallest allowed upstream page size that is ≥ the caller's limit and
 * slices out exactly the caller's rows, which may span two upstream pages.
 * Every page reports `pagedLocally`, so the paging gate judges the page
 * served rather than the snapped size sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { LuminSignAdapter } from '../../../../../../src/verticals/docsign/adapters/lumin-sign/index'

const CREDS = { accessToken: 'lmn_test', extra: { environment: 'production' } }
const ALLOWED = [10, 25, 50]
const N_ROWS = 200
/**
 * No case here needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of running the worker out of
 * memory: each fake call resolves as a microtask, so vitest's timeout never
 * fires on a runaway loop.
 */
const CALL_BUDGET = 20

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    template_id: `t${i + 1}`,
    type: 'pdf',
    name: `Template ${i + 1}`,
    created_at: 1748456885430,
    updated_at: 1748456885430,
  }))
}

/**
 * A fake Lumin that honours ONLY the documented parameters: `page` (integer,
 * min 1) and `limit` (one of 10, 25, 50), plus the required
 * `X-Lumin-API-Version` header. Anything else is refused, as Lumin would.
 */
function fakeLumin(total: number) {
  const all = rows(total)
  let calls = 0
  const get = vi.fn(
    async (
      path: string,
      cfg?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      if (++calls > CALL_BUDGET) {
        throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
      }
      if (path !== '/templates') throw new Error(`unexpected path ${path}`)
      const page = cfg?.params?.['page']
      const limit = cfg?.params?.['limit']
      if (cfg?.headers?.['X-Lumin-API-Version'] !== '1.1') {
        throw new Error('missing X-Lumin-API-Version: 1.1')
      }
      if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
        throw new Error(`400: page must be an integer >= 1 (got ${String(page)})`)
      }
      if (typeof limit !== 'number' || !ALLOWED.includes(limit)) {
        throw new Error(`400: limit must be one of 10, 25, 50 (got ${String(limit)})`)
      }
      const start = (page - 1) * limit
      return {
        data: { page, limit, total_count: total, data: all.slice(start, start + limit) },
      }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), put: vi.fn() } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `t${start + i}`)
}

const METHODS = [
  {
    name: 'listTemplates',
    call: (a: LuminSignAdapter, p: QueryParams) => a.listTemplates(CREDS, p),
  },
] as const

afterEach(() => vi.restoreAllMocks())

describe('lumin-sign capabilities', () => {
  it('declares the documented maximum page size (50) so the sync worker never asks for more', () => {
    expect(
      new LuminSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' }).capabilities,
    ).toEqual(expect.objectContaining({ maxPageSize: 50 }))
  })
})

describe.each(METHODS)('lumin-sign $name paging', ({ call }) => {
  const adapter = () => new LuminSignAdapter({ clientId: '', clientSecret: '', redirectUri: '' })
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((t) => t.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }

  it('page 1 returns the first rows and asks Lumin for page=1', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/templates', {
      params: { page: 1, limit: 10 },
      headers: { 'X-Lumin-API-Version': '1.1' },
    })
  })

  it('page 2 returns the next rows and asks Lumin for page=2', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![1]!.params).toEqual({ page: 2, limit: 10 })
  })

  it('a missing page returns the first rows and still sends page=1', async () => {
    // Lumin's doc page marks `page` required; its GitHub openapi.yaml marks it
    // optional. Sending it always is correct under both, so keep sending it.
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([{ page: 1, limit: 10 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakeLumin(N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(get.mock.calls[0]![1]!.params).toEqual({ page: 1, limit: 10 })
  })

  it('a limit above the documented max (50) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '1', limit: '100' })).toEqual(ids(1, 50))
    expect(await run({ page: '2', limit: '100' })).toEqual(ids(51, 50))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([
      { page: 1, limit: 50 },
      { page: 2, limit: 50 },
    ])
  })

  it('a direct limit above 50 reports the 50 it pages by, so listPage walks every row', async () => {
    // parseListQuery with the adapter caps at 50; a direct caller does not.
    // Judged at 100, the first 50-row page read as the last one.
    fakeLumin(N_ROWS)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit: 100 })
      const env = listPage(await call(adapter(), params), params, 'lumin-sign')
      expect(readUpstreamPage(params)).toEqual({ pagedLocally: true, pageSize: 50 })
      expect(env.meta.limit).toBe(50)
      seen.push(...env.data.map((t) => t.id))
      if (env.meta.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, N_ROWS))
  })

  it('reports no pageSize at a limit it serves in full', async () => {
    fakeLumin(N_ROWS)
    for (const limit of ['7', '50']) {
      const params = parseListQuery({ page: '1', limit })
      await call(adapter(), params)
      expect(readUpstreamPage(params), limit).toEqual({ pagedLocally: true })
    }
  })

  it('a limit outside {10, 25, 50} returns exactly that many rows (page 1 of limit 7)', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '1', limit: '7' })).toEqual(ids(1, 7))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([{ page: 1, limit: 10 }])
  })

  it('page 2 of limit 7 spans two upstream pages of 10 and returns rows 8..14', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '2', limit: '7' })).toEqual(ids(8, 7))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([
      { page: 1, limit: 10 },
      { page: 2, limit: 10 },
    ])
  })

  it('page 2 of limit 30 reads upstream pages of 50 and returns rows 31..60', async () => {
    const { get } = fakeLumin(N_ROWS)
    expect(await run({ page: '2', limit: '30' })).toEqual(ids(31, 30))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([
      { page: 1, limit: 50 },
      { page: 2, limit: 50 },
    ])
  })

  it('stops at a short upstream page instead of reading past the end', async () => {
    const { get } = fakeLumin(5)
    expect(await run({ page: '1', limit: '7' })).toEqual(ids(1, 5))
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([{ page: 1, limit: 10 }])
  })

  it('returns the tail of the last page when the caller page straddles the end', async () => {
    const { get } = fakeLumin(12)
    expect(await run({ page: '2', limit: '7' })).toEqual(ids(8, 5))
    expect(get).toHaveBeenCalledTimes(2)
    get.mockClear()
    // Rows 15..21 start past the end: one short read of upstream page 2, then stop.
    expect(await run({ page: '3', limit: '7' })).toEqual([])
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual([{ page: 2, limit: 10 }])
  })

  it('a direct call with no limit keeps the adapter default (50)', async () => {
    const { get } = fakeLumin(N_ROWS)
    const out = await call(adapter(), {})
    expect(out.map((t) => t.id)).toEqual(ids(1, 50))
    expect(get.mock.calls[0]![1]!.params).toEqual({ page: 1, limit: 50 })
  })

  // parseListQuery never produces these; a direct caller (not the router, not
  // the sync worker) can. Below 1 or NaN falls back to the default, as before
  // this adapter paged by rows; a fractional limit is floored.
  it.each([
    { name: 'limit 0', params: { limit: 0 }, want: ids(1, 50), sent: [{ page: 1, limit: 50 }] },
    {
      name: 'limit -5, page 2',
      params: { limit: -5, page: 2 },
      want: ids(51, 50),
      sent: [{ page: 2, limit: 50 }],
    },
    { name: 'limit NaN', params: { limit: NaN }, want: ids(1, 50), sent: [{ page: 1, limit: 50 }] },
    {
      name: 'limit 7.5, page 2',
      params: { limit: 7.5, page: 2 },
      want: ids(8, 7),
      sent: [
        { page: 1, limit: 10 },
        { page: 2, limit: 10 },
      ],
    },
  ])('a direct call with $name is served as a valid limit', async ({ params, want, sent }) => {
    const { get } = fakeLumin(N_ROWS)
    expect((await call(adapter(), params)).map((t) => t.id)).toEqual(want)
    expect(get.mock.calls.map((c) => c[1]!.params)).toEqual(sent)
  })

  it.each([1, 10, 7, 25, 30, 50])(
    'a sync-style walk at limit %i returns all 2L+1 rows once, in order',
    async (L) => {
      const n = 2 * L + 1
      const { get } = fakeLumin(n)
      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const before = get.mock.calls.length
        const params = withPageSink({ page: k, limit: L })
        const page = (await call(adapter(), params)).map((t) => t.id)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
        // The allowed size is >= L, so a caller page spans at most 2 upstream pages.
        expect(get.mock.calls.length - before).toBeLessThanOrEqual(2)
        // The API path's listPage truncates any over-return to the caller's
        // limit, so rows past L on a page are rows lost.
        expect(page.length).toBeLessThanOrEqual(L)
        seen.push(...page)
        if (page.length < L) break
      }
      expect(seen).toEqual(ids(1, n))
    },
  )
})
