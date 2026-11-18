/**
 * Sinay (SafeCube) list paging.
 *
 * listShipments calls POST /public/shipments/search on the Shipment Management
 * API. The first-party spec
 * (https://documentation.safecube.ai/reference/post_public-shipments-search.md)
 * documents a request body with ONE property, the required `shipmentNumbers`
 * array, and a `ShipmentSearchResponse` of `results` plus `notFoundResults`:
 * no page, limit, offset or cursor, and no next signal. One response is the
 * whole collection, so the adapter pages it locally.
 *
 * Before this, the adapter returned every result on every page, so page 2
 * repeated page 1.
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
import { SinayAdapter } from '../../../../../../src/verticals/logistics/adapters/sinay/index'

const CREDS = { accessToken: 'sinay_test' }
const CALL_BUDGET = 20

interface Call {
  path: string
  body: unknown
}

/**
 * A fake Shipment Management API honouring ONLY what the spec documents for
 * POST /public/shipments/search: a body whose single key is `shipmentNumbers`,
 * answered with `{ results, notFoundResults }`. Any other body key is refused.
 * An empty `shipmentNumbers` array answers with the whole portfolio, which is
 * the adapter's (undocumented) unfiltered read.
 */
function fakeSinay(opts: { shipments: number }) {
  const shipments = Array.from({ length: opts.shipments }, (_, i) => {
    const n = String(i + 1).padStart(4, '0')
    return {
      id: `uuid-${n}`,
      shipmentNumber: `MSCU${n}`,
      sealine: 'MSCU',
      sealineName: 'MSC',
      link: `https://app.safecube.ai/shared/shipment?token=${n}`,
    }
  })
  const calls: Call[] = []
  const post = vi.fn(async (path: string, body: unknown) => {
    if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
    calls.push({ path, body })
    if (path !== 'public/shipments/search') throw new Error(`unexpected path ${path}`)
    const b = body as Record<string, unknown>
    const extra = Object.keys(b).filter((k) => k !== 'shipmentNumbers')
    if (extra.length) throw new Error(`undocumented body keys sent: ${extra.join(',')}`)
    const wanted = b['shipmentNumbers']
    if (!Array.isArray(wanted)) throw Object.assign(new Error('400'), { status: 400 })
    if (wanted.length === 0) return { data: { results: shipments, notFoundResults: [] } }
    return {
      data: {
        results: shipments.filter((s) => wanted.includes(s.shipmentNumber)),
        notFoundResults: wanted.filter((w) => !shipments.some((s) => s.shipmentNumber === w)),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get: vi.fn(),
    post,
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { calls }
}

const adapter = () => new SinayAdapter()
const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `uuid-${String(from + i).padStart(4, '0')}`)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sinay listShipments (unpaginated search, paged locally)', () => {
  const list = (p: QueryParams) => adapter().listShipments(CREDS, p)

  it('with 2L+1 rows, pages 1..3 at limit L return every shipment once, in order, hasMore exact', async () => {
    const L = 4
    fakeSinay({ shipments: 2 * L + 1 })
    const seen: string[] = []
    const hasMore: boolean[] = []
    const reported: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'sinay')
      seen.push(...env.data.map((s) => s.id!))
      hasMore.push(env.meta.hasMore as boolean)
      const up = readUpstreamPage(params)
      reported.push(up?.hasMore)
      expect(up?.pagedLocally).toBe(true)
      expect(up?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('the page-2 request carries only the documented shipmentNumbers key', async () => {
    const { calls } = fakeSinay({ shipments: 10 })
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toEqual([{ path: 'public/shipments/search', body: { shipmentNumbers: [] } }])
  })

  it('a limit above the collection size needs no upstream clamp: one page holds everything and reports the end', async () => {
    const { calls } = fakeSinay({ shipments: 7 })
    const params = withPageSink({ page: 1, limit: 5000 })
    const env = listPage(await list(params), params, 'sinay')
    expect(env.data.map((s) => s.id)).toEqual(ids(1, 7))
    expect(env.meta.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('a targeted search by ids is paged locally too', async () => {
    fakeSinay({ shipments: 10 })
    const params = withPageSink({ page: 2, limit: 2 })
    ;(params as Record<string, unknown>)['ids'] = ['MSCU0001', 'MSCU0002', 'MSCU0003']
    const env = listPage(await list(params), params, 'sinay')
    expect(env.data.map((s) => s.id)).toEqual(['uuid-0003'])
    expect(env.meta.hasMore).toBe(false)
  })

  it('a collection far above one page is handed to the pager whole: 137 rows at limit 20 walk every id once', async () => {
    const N = 137
    const L = 20
    fakeSinay({ shipments: N })
    const seen: string[] = []
    for (let k = 1; k <= Math.ceil(N / L); k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await list(params), params, 'sinay')
      seen.push(...env.data.map((s) => s.id!))
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(k < Math.ceil(N / L))
    }
    expect(seen).toEqual(ids(1, N))
  })

  it('a targeted search returning more rows than a page is handed to the pager whole too', async () => {
    const N = 120
    fakeSinay({ shipments: N })
    const wanted = Array.from({ length: N }, (_, i) => `MSCU${String(i + 1).padStart(4, '0')}`)
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 50 })
      ;(params as Record<string, unknown>)['ids'] = wanted
      const env = listPage(await list(params), params, 'sinay')
      seen.push(...env.data.map((s) => s.id!))
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
      expect(env.meta.hasMore).toBe(k < 3)
    }
    expect(seen).toEqual(ids(1, N))
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with an exact hasMore', async () => {
    fakeSinay({ shipments: 7 })
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await list(params), params, 'sinay')
    expect(env.data.map((s) => s.id)).toEqual(ids(4, 3))
    expect(env.meta.hasMore).toBe(true)
  })
})
