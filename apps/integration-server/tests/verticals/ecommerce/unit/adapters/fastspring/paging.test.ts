/**
 * FastSpring discounts (coupons) paging contract.
 *
 * `GET /coupons` takes no query parameters and "Returns an array of all
 * coupon path identifiers." (https://developer.fastspring.com/reference/list-all-coupons)
 * — `{ coupons: string[] }` with no page/limit/nextPage/total. The adapter
 * must window that whole list locally (pageLocally) and GET only the ids of
 * the caller's page from `GET /coupons/{coupon_id}`.
 *
 * The fake upstream below honours only what the docs describe: the list
 * endpoint ignores every query parameter and returns every id, and the
 * per-id endpoint returns one coupon.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { FastspringAdapter } from '../../../../../../src/verticals/ecommerce/adapters/fastspring/index'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../../../../../../src/verticals/ecommerce/adapters/fastspring/constants'

const CREDS = { accessToken: 'fs-user', extra: { apiUsername: 'fs-user', apiPassword: 'fs-pass' } }

interface Call {
  path: string
  params: Record<string, unknown>
}

function fakeCoupons(count: number): { calls: Call[]; ids: string[] } {
  const ids = Array.from({ length: count }, (_, i) => `coupon-${String(i + 1).padStart(4, '0')}`)
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    calls.push({ path, params: cfg?.params ?? {} })
    // Documented: no parameters, every coupon id, no paging envelope.
    if (path === '/coupons') return { data: { coupons: [...ids] } }
    const m = /^\/coupons\/([^/]+)$/.exec(path)
    if (m && ids.includes(m[1]!)) {
      return { data: { coupon: m[1], discount: { type: 'percent', percent: 10 } } }
    }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls, ids }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FastSpring listDiscounts paging', () => {
  it('serves 2L+1 coupons once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { ids } = fakeCoupons(2 * L + 1)
    const adapter = new FastspringAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listDiscounts!(CREDS, params)
      seen.push(...rows.map((d) => d.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 fetches only the ids of page 2 and reports pagedLocally', async () => {
    const L = 3
    const { calls, ids } = fakeCoupons(2 * L + 1)
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    await adapter.listDiscounts!(CREDS, params)
    // GET /coupons documents no page/limit keys: the page is cut locally, so
    // the list request carries none and the per-id GETs are the page's ids.
    expect(calls[0]).toEqual({ path: '/coupons', params: {} })
    expect(calls.slice(1).map((c) => c.path)).toEqual(
      ids.slice(L, 2 * L).map((id) => `/coupons/${id}`),
    )
    expect(readUpstreamPage(params)).toMatchObject({ pagedLocally: true, totalCount: 2 * L + 1 })
  })

  it('clamps a limit above MAX_PAGE_SIZE and still serves every row', async () => {
    const N = 2 * MAX_PAGE_SIZE + 1
    const { calls, ids } = fakeCoupons(N)
    const adapter = new FastspringAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: MAX_PAGE_SIZE * 5 } as QueryParams)
      const before = calls.length
      const rows = await adapter.listDiscounts!(CREDS, params)
      // one list call + at most MAX_PAGE_SIZE per-id GETs
      expect(calls.length - before).toBeLessThanOrEqual(MAX_PAGE_SIZE + 1)
      expect(rows.length).toBeLessThanOrEqual(MAX_PAGE_SIZE)
      const meta = readUpstreamPage(params)
      expect(meta?.pageSize).toBe(MAX_PAGE_SIZE)
      seen.push(...rows.map((d) => d.id))
      if (!meta?.hasMore) break
      page++
      expect(page).toBeLessThan(10)
    }
    expect(seen).toEqual(ids)
  })

  it('with no limit, serves DEFAULT_PAGE_SIZE ids (not every coupon) and reports hasMore', async () => {
    const N = MAX_PAGE_SIZE + 1
    const { calls, ids } = fakeCoupons(N)
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 1 } as QueryParams)
    const rows = await adapter.listDiscounts!(CREDS, params)
    expect(rows.map((d) => d.id)).toEqual(ids.slice(0, DEFAULT_PAGE_SIZE))
    expect(calls.length).toBe(1 + DEFAULT_PAGE_SIZE)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: N })
  })

  it.each([0, 0.5, -3, Number.NaN])(
    'an unusable limit (%s) falls back to DEFAULT_PAGE_SIZE, never every coupon',
    async (limit) => {
      const N = MAX_PAGE_SIZE + 1
      const { calls, ids } = fakeCoupons(N)
      const adapter = new FastspringAdapter()
      const params = withPageSink({ page: 1, limit } as QueryParams)
      const rows = await adapter.listDiscounts!(CREDS, params)
      expect(rows.map((d) => d.id)).toEqual(ids.slice(0, DEFAULT_PAGE_SIZE))
      expect(calls.length).toBe(1 + DEFAULT_PAGE_SIZE)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    },
  )

  it('a fractional limit is floored', async () => {
    const { ids } = fakeCoupons(10)
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 2, limit: 2.7 } as QueryParams)
    const rows = await adapter.listDiscounts!(CREDS, params)
    expect(rows.map((d) => d.id)).toEqual(ids.slice(2, 4))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fakeCoupons(5)
    const adapter = new FastspringAdapter()

    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const r1 = listPage(await adapter.listDiscounts!(CREDS, p1), p1, 'fastspring')
    expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 2))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const r3 = listPage(await adapter.listDiscounts!(CREDS, p3), p3, 'fastspring')
    expect(r3.data.map((d) => d.id)).toEqual(ids.slice(4))
    expect(r3.meta.hasMore).toBe(false)
  })
})
