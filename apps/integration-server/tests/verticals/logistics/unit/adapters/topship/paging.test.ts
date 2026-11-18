/**
 * Topship `listShipments` (GET /get-shipments) pages by page number:
 * https://api-topship.com/shipping/docs/README.md ("Get Booked Shipments")
 *   "Filters include dateRange, keyword, isPaid, take and page."
 * Both travel inside the JSON `filter` query parameter, e.g.
 *   get-shipments?filter={ "take": 10, "page": 2 }
 * and the response carries `totalPages`, `currentPage` and `totalCount`
 * beside `list`.
 *
 * Before this, the adapter always sent `page: 1`, so page 2 repeated page 1
 * and a sync never reached the second page.
 *
 * The docs state no maximum for `take`, so the adapter declares no
 * `maxPageSize`. It keeps its pre-existing 100-row clamp and, when that clamp
 * bites, reports the size it sent as `pageSize`, so page strides stay
 * consistent.
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
import { TopshipAdapter } from '../../../../../../src/verticals/logistics/adapters/topship/index'

const CREDS = { accessToken: 'ts_test' }
const CALL_BUDGET = 20

function shipments(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `S-${i + 1}`,
    trackingId: `T-${i + 1}`,
    shipmentStatus: 'Confirmed',
  }))
}

/**
 * A fake Topship that honours ONLY what the docs describe: a JSON `filter`
 * query parameter whose `take` and `page` select a 1-based page, and a
 * response of `{ totalPages, currentPage, totalCount, list }`.
 */
function fakeTopship(total: number, omit: { totalPages?: boolean; totalCount?: boolean } = {}) {
  const all = shipments(total)
  let calls = 0
  const filters: Array<Record<string, unknown>> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== 'get-shipments') throw new Error(`unexpected path ${path}`)
    const keys = Object.keys(cfg?.params ?? {})
    if (keys.some((k) => k !== 'filter')) throw new Error(`undocumented params: ${keys.join(',')}`)
    const filter = JSON.parse(String(cfg?.params?.['filter'] ?? '{}')) as Record<string, unknown>
    filters.push(filter)
    const take = Number(filter['take'] ?? 10)
    const page = Number(filter['page'] ?? 1)
    const start = (page - 1) * take
    return {
      data: {
        ...(omit.totalPages ? {} : { totalPages: Math.ceil(total / take) }),
        currentPage: page,
        ...(omit.totalCount ? {} : { totalCount: total }),
        list: all.slice(start, start + take),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get, filters }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `S-${start + i}`)
}

const list = (p: QueryParams) => new TopshipAdapter().listShipments(CREDS, p)

afterEach(() => vi.restoreAllMocks())

describe('topship listShipments paging (page number in the filter)', () => {
  it('with 2L+1 rows, pages 1..3 at limit L return every shipment once, in order, hasMore exact', async () => {
    const L = 4
    fakeTopship(2 * L + 1)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'topship')
      seen.push(...env.data.map((s) => s.id!))
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)).toEqual(expect.objectContaining({ totalCount: 2 * L + 1 }))
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page and take in the filter', async () => {
    const { filters } = fakeTopship(10)
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(filters).toEqual([{ take: 3, page: 2 }])
  })

  it('reports the platform hasMore from totalPages', async () => {
    fakeTopship(6)
    const p = withPageSink({ page: 2, limit: 3 })
    await list(p)
    expect(readUpstreamPage(p)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 6, totalPages: 2, currentPage: 2 }),
    )
  })

  it('without totalPages, hasMore falls back to totalCount at the exact boundary', async () => {
    fakeTopship(6, { totalPages: true })
    const last = withPageSink({ page: 2, limit: 3 })
    await list(last)
    expect(readUpstreamPage(last)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 6 }),
    )
    const first = withPageSink({ page: 1, limit: 3 })
    await list(first)
    expect(readUpstreamPage(first)).toEqual(expect.objectContaining({ hasMore: true }))
  })

  it('with totalPages but no totalCount, hasMore still comes from totalPages', async () => {
    fakeTopship(7, { totalCount: true })
    const mid = withPageSink({ page: 2, limit: 3 })
    await list(mid)
    expect(readUpstreamPage(mid)).toEqual(expect.objectContaining({ hasMore: true, totalPages: 3 }))
    const last = withPageSink({ page: 3, limit: 3 })
    await list(last)
    expect(readUpstreamPage(last)).toEqual(expect.objectContaining({ hasMore: false }))
  })

  it('a limit above the adapter clamp is clamped, reported as pageSize, and pages at that size', async () => {
    const { filters } = fakeTopship(250)
    const p1 = withPageSink({ page: 1, limit: 500 })
    const env1 = listPage(await list(p1), p1, 'topship')
    expect(filters[0]).toEqual({ take: 100, page: 1 })
    expect(readUpstreamPage(p1)).toEqual(expect.objectContaining({ pageSize: 100 }))
    expect(env1.data).toHaveLength(100)
    expect(env1.meta.limit).toBe(100)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = withPageSink({ page: 3, limit: 500 })
    const env3 = listPage(await list(p3), p3, 'topship')
    expect(filters[1]).toEqual({ take: 100, page: 3 })
    expect(env3.data.map((s) => s.id)).toEqual(ids(201, 50))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeTopship(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'topship')
    expect(env.data.map((s) => s.id)).toEqual(ids(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
