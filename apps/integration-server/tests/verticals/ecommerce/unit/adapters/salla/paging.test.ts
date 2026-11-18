/**
 * Salla listLocations paging: 1-based `page` + caller's `limit` → Salla's
 * `page` and `per_page` query parameters on GET /admin/v2/branches.
 *
 * https://docs.salla.dev/pagination.md:
 *   "To get the next batch of results, call the same route again with a `page`
 *    request parameter corresponding to the `currentPage` and `totalPages`
 *    property received in the last call on the `pagination` part of the response."
 *   "Additionally, you may also include the `per_page` query parameter in any list
 *    endpoint to decrease or increase the number of records returned per page."
 *   "Note that the maximum value for the `per_page` query parameter is `60`"
 *
 * https://docs.salla.dev/branches/list.md documents `page` ("The Pagination page
 * number") and a 200 example carrying
 * `pagination: { count, total, perPage: 15, currentPage, totalPages, links }`.
 *
 * The other list methods already forwarded page + per_page (gate verdict ok) and
 * are not covered here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { SallaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/salla/index'

const CREDS = { accessToken: 'salla_test' }
/** "the maximum value for the `per_page` query parameter is `60`" */
const MAX = 60
/** `perPage: 15` in the documented List Branches example. */
const DEFAULT_PER_PAGE = 15

/**
 * A fake Salla that honours ONLY the documented `page` and `per_page` query
 * parameters on /branches. Any other query key, a `per_page` over the
 * documented maximum, or a non-integer one, is refused with a 422 rather than
 * silently ignored or corrected.
 */
function fakeSalla(total: number, opts: { failOn?: number } = {}) {
  const sent: { page: number; per_page: number }[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== '/branches') throw Object.assign(new Error(`unexpected ${path}`), { status: 404 })
    const p = config?.params ?? {}
    const unknown = Object.keys(p).filter((k) => k !== 'page' && k !== 'per_page')
    if (unknown.length > 0) {
      throw Object.assign(new Error(`unknown query params: ${unknown.join(',')}`), { status: 422 })
    }
    const perPage = p['per_page'] === undefined ? DEFAULT_PER_PAGE : p['per_page']
    const page = p['page'] === undefined ? 1 : p['page']
    if (typeof perPage !== 'number' || !Number.isInteger(perPage) || perPage < 1 || perPage > MAX) {
      throw Object.assign(new Error(`per_page out of range: ${String(perPage)}`), { status: 422 })
    }
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      throw Object.assign(new Error(`page out of range: ${String(page)}`), { status: 422 })
    }
    sent.push({ page, per_page: perPage })
    if (opts.failOn === page) throw Object.assign(new Error('server error'), { status: 500 })
    const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1, name: `b${i + 1}` }))
    const data = rows.slice((page - 1) * perPage, page * perPage)
    const totalPages = Math.max(1, Math.ceil(total / perPage))
    return {
      data: {
        status: 200,
        success: true,
        data,
        pagination: {
          count: data.length,
          total,
          perPage,
          currentPage: page,
          totalPages,
          links: [],
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { sent }
}

const adapter = () =>
  new SallaAdapter({ clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x.test/cb' })

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

afterEach(() => vi.restoreAllMocks())

describe('salla listLocations paging', () => {
  it.each([10, 7])(
    'N = 2L + 1 rows driven like the sync (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeSalla(n)
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const k of [1, 2, 3]) {
        const params = withPageSink({ page: k, limit })
        seen.push(...(await adapter().listLocations(CREDS, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('N = 2L rows (a full last page) end on page 2 from the envelope, not a row-count guess', async () => {
    const limit = 10
    const n = 2 * limit
    const { sent } = fakeSalla(n)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const k of [1, 2]) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await adapter().listLocations(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, n))
    expect(hasMore).toEqual([true, false])
    expect(sent).toHaveLength(2)
  })

  it('with no page or limit, asks for page 1 at the documented default of 15', async () => {
    const { sent } = fakeSalla(40)
    const rows = await adapter().listLocations(CREDS, withPageSink({}))
    expect(rows.map((r) => r.id)).toEqual(ids(1, DEFAULT_PER_PAGE))
    expect(sent).toEqual([{ page: 1, per_page: DEFAULT_PER_PAGE }])
  })

  it.each([
    [0, DEFAULT_PER_PAGE],
    [-5, DEFAULT_PER_PAGE],
    [10.7, 10],
  ])('limit %s is sent as per_page %i', async (limit, perPage) => {
    const { sent } = fakeSalla(40)
    const rows = await adapter().listLocations(CREDS, withPageSink({ page: 1, limit }))
    expect(rows.map((r) => r.id)).toEqual(ids(1, perPage))
    expect(sent).toEqual([{ page: 1, per_page: perPage }])
  })

  it('page 2 sends the documented `page` key with the caller limit as `per_page`', async () => {
    const { sent } = fakeSalla(50)
    const rows = await adapter().listLocations(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ page: 2, per_page: 10 }])
  })

  it('a limit above the 60-row per_page maximum is clamped and still serves every row', async () => {
    const limit = 100
    const n = 2 * MAX + 1
    const { sent } = fakeSalla(n)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = (await adapter().listLocations(CREDS, params)).map((r) => r.id)
      expect(effectivePageSize(params, limit)).toBe(MAX)
      expect(page.length).toBeLessThanOrEqual(MAX)
      seen.push(...page)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(1, n))
    expect(sent).toEqual([
      { page: 1, per_page: MAX },
      { page: 2, per_page: MAX },
      { page: 3, per_page: MAX },
    ])
  })

  it('the API path (parseListQuery then listPage) reports meta.hasMore', async () => {
    fakeSalla(25)
    const a = adapter()
    const p2 = parseListQuery({ page: '2', limit: '10' }, a as EcommerceAdapter)
    const env2 = listPage(await a.listLocations(CREDS, p2), p2, 'salla')
    expect(env2.data.map((r) => r.id)).toEqual(ids(11, 10))
    expect(env2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '10' }, a as EcommerceAdapter)
    const env3 = listPage(await a.listLocations(CREDS, p3), p3, 'salla')
    expect(env3.data.map((r) => r.id)).toEqual(ids(21, 5))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('a failure past page 1 is thrown, not replaced by the synthetic default row', async () => {
    fakeSalla(30, { failOn: 2 })
    await expect(
      adapter().listLocations(CREDS, withPageSink({ page: 2, limit: 10 })),
    ).rejects.toThrow('server error')
  })

  it('a page-1 failure still falls back to the single synthetic location, and ends the list', async () => {
    fakeSalla(30, { failOn: 1 })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter().listLocations(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['default'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
