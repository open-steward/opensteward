/**
 * DHL Parcel DE Shipping v2 list paging: neither list endpoint paginates, so
 * the adapter slices the caller's page locally.
 *
 * First-party spec (DHL's own download from the API reference page):
 * https://developer.dhl.com/sites/default/files/2026-05/parcel-de-shipping-v2.yaml
 *
 *   GET /orders (listLabels)
 *     shipment: "This parameter identifies shipments. The parameter can be used
 *     multiple times in one request to get the labels and/or documents for up
 *     to 30 shipments maximum."
 *     The other query parameters are formats (docFormat, printFormat, ...,
 *     includeDocs); none is a page, offset or cursor.
 *
 *   GET /manifests (listManifests)
 *     "Return the manifest document for the specific date (abbreviated ISO8601
 *     format YYYY-MM-DD). If no date is provided, the manifest for today will
 *     be returned." Query parameters: billingNumber, date, includeDocs.
 *
 * So page 2 of the caller must come from the same request as page 1, sliced
 * by pageLocally. Before this fix the router cut every response to `limit`,
 * page 2 repeated page 1, and rows past the first page could never be reached.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { DhlParcelDeAdapter } from '../../../../../../src/verticals/logistics/adapters/dhl-parcel-de/index'

const CREDS = { accessToken: 'dhl-test-token' }
const CALL_BUDGET = 20
const L = 5
const N = 2 * L + 1

const ORDERS_KEYS = [
  'shipment',
  'docFormat',
  'printFormat',
  'retourePrintFormat',
  'includeDocs',
  'combine',
]
const MANIFEST_KEYS = ['billingNumber', 'date', 'includeDocs']

/**
 * A fake DHL Parcel DE that honours ONLY the documented query parameters and
 * returns every requested row in one response, as the real endpoints do.
 */
function fakeDhl(total: number) {
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    const params = cfg?.params ?? {}
    const keys = Object.keys(params)
    if (path === 'orders') {
      const bad = keys.filter((k) => !ORDERS_KEYS.includes(k))
      if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
      const shipments = params['shipment'] as string[]
      if (shipments.length > 30) throw new Error('400: more than 30 shipments')
      return {
        data: {
          status: { statusCode: 200 },
          items: shipments.map((s) => ({
            shipmentNo: s,
            label: { url: `https://dhl.example/${s}.pdf`, fileFormat: 'PDF' },
          })),
        },
      }
    }
    if (path === 'manifests') {
      const bad = keys.filter((k) => !MANIFEST_KEYS.includes(k))
      if (bad.length) throw new Error(`400: undocumented query params ${bad.join(',')}`)
      return {
        data: {
          status: { statusCode: 200 },
          manifestDate: (params['date'] as string | undefined) ?? '2026-09-24',
          manifest: { url: 'https://dhl.example/manifest.pdf', fileFormat: 'PDF' },
        },
      }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), delete: vi.fn() } as never)
  return { get, total }
}

const shipmentIds = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `00340434${String(from + i).padStart(10, '0')}`)
const shipmentParam = (n: number) => shipmentIds(1, n).join(',')

afterEach(() => vi.restoreAllMocks())

describe('dhl-parcel-de listLabels paging', () => {
  const adapter = () => new DhlParcelDeAdapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeDhl(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L, shipmentNumbers: shipmentParam(N) })
      const rows = await adapter().listLabels(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: N, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(shipmentIds(1, N))
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request is the documented unpaged GET /orders, with no invented paging key', async () => {
    const { get } = fakeDhl(N)
    await adapter().listLabels(
      CREDS,
      withPageSink({ page: 2, limit: L, shipmentNumbers: shipmentParam(N) }),
    )
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('orders')
    expect(get.mock.calls[0]![1]).toEqual({
      params: { shipment: shipmentIds(1, N), includeDocs: 'URL' },
    })
  })

  it('a limit above the router maximum is clamped, and serves every row with hasMore false', async () => {
    fakeDhl(N)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    Object.assign(params, { shipmentNumbers: shipmentParam(N) })
    const rows = await adapter().listLabels(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(shipmentIds(1, N))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves page 2 with exact meta', async () => {
    fakeDhl(N)
    const params = parseListQuery({ page: '2', limit: String(L) })
    Object.assign(params, { shipmentNumbers: shipmentParam(N) })
    const env = listPage(await adapter().listLabels(CREDS, params), params, 'dhl-parcel-de')
    expect(env.data.map((r) => r.id)).toEqual(shipmentIds(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, totalCount: N, hasMore: true }),
    )
  })
})

describe('dhl-parcel-de listManifests paging', () => {
  const adapter = () => new DhlParcelDeAdapter()

  it('the single daily manifest is served on page 1 only, with exact hasMore', async () => {
    fakeDhl(1)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 1, date: '2026-09-23' })
      const rows = await adapter().listManifests(CREDS, params)
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: 1, pagedLocally: true }),
      )
    }
    expect(seen).toEqual(['2026-09-23'])
    expect(more).toEqual([false, false, false])
  })

  it('the page-2 request is the documented unpaged GET /manifests, with no invented paging key', async () => {
    const { get } = fakeDhl(1)
    const rows = await adapter().listManifests(CREDS, withPageSink({ page: 2, limit: L }))
    expect(rows).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('manifests')
    expect(get.mock.calls[0]![1]).toEqual({ params: { includeDocs: 'URL' } })
  })

  it('a limit above the router maximum is clamped, and serves the manifest with hasMore false', async () => {
    fakeDhl(1)
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter().listManifests(CREDS, params)
    expect(rows).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery → adapter → listPage serves an empty page 2 with exact meta', async () => {
    fakeDhl(1)
    const params = parseListQuery({ page: '2', limit: '1' })
    const env = listPage(await adapter().listManifests(CREDS, params), params, 'dhl-parcel-de')
    expect(env.data).toEqual([])
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: 1, totalCount: 1, hasMore: false }),
    )
  })
})
