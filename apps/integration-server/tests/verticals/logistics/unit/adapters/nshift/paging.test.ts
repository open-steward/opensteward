/**
 * nShift (Unifaun) list rebuild.
 *
 * First-party spec: the REST API RAML,
 * https://api.unifaun.com/rs-extapi/v1/documentation/root-resource-v1.raml
 *
 *   GET /shipments-history: "Fetch information about shipments (max 6 months
 *   old)." Query parameters page (required: "Number of page you need to see.
 *   Each page contains 50 records."), dateFrom, dateTo, dateType, searchField
 *   (enum [ '', orderNo, reference, shipmentNo, shipmentId, parcelNo ]),
 *   searchValue, status. Example response `{ "page": 0, "totalPages": 1,
 *   "shipments": [...] }`; sibling paged resources say "The page parameter
 *   starts on zero".
 *
 *   listShipments used GET /stored-shipments ("a maxium of 50 stored
 *   shipments will be returned", no paging) with an undocumented `max`.
 *   listLabels flattened undocumented `pdfs` off the same capped call.
 *   listManifests called GET /shipment-manifests, which the RAML does not
 *   declare; the real list needs a {manifestType} with no documented values.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/logistics/adapters/nshift/client', () => ({
  NShiftClient: class {
    constructor(private readonly creds: { accessToken?: string }) {}
    get = (path: string, params?: Record<string, unknown>) =>
      getMock(path, params, this.creds.accessToken)
    post = () => {
      throw new Error('unexpected POST')
    }
    delete = () => {
      throw new Error('unexpected DELETE')
    }
  },
}))

import { NShiftAdapter } from '../../../../../../src/verticals/logistics/adapters/nshift'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'

const CREDS = { accessToken: 'aWQ6c2VjcmV0' } as Credentials
/** Documented fixed page size of /shipments-history. */
const UPSTREAM = 50
/** Caller page size: not a divisor of 50, so caller pages straddle upstream pages. */
const L = 30
/** 2L+1 = 61 rows: upstream pages of 50 and 11 (the uneven last page). */
const N = 2 * L + 1
const CALL_BUDGET = 50

const HISTORY_KEYS = new Set([
  'page',
  'dateFrom',
  'dateTo',
  'dateType',
  'searchField',
  'searchValue',
  'status',
])
const SEARCH_FIELDS = new Set(['', 'orderNo', 'reference', 'shipmentNo', 'shipmentId', 'parcelNo'])

function row(id: string, orderNo = `order ${id}`) {
  // Built from the documented example row of GET /shipments-history.
  return {
    href: `https://api.unifaun.com/rs-extapi/v1/shipments/${id}`,
    id,
    status: 'PRINTED',
    shipmentNo: null,
    orderNo,
    reference: 'sender ref 234',
    serviceId: 'P15',
    parcelCount: 1,
    sndName: 'nShift Gbg',
    sndZipcode: '41121',
    sndCity: 'GÖTEBORG',
    sndCountry: 'SE',
    rcvName: 'nShift Sthm',
    rcvZipcode: '11359',
    rcvCity: 'STOCKHOLM',
    rcvCountry: 'SE',
    created: '2015-06-03T13:18:30.904+0000',
    changed: '2015-06-03T13:18:30.904+0000',
    parcels: [{ parcelNo: `3733253898939${id}`, returnParcelNo: null }],
    pdfs: null,
  }
}

type Row = ReturnType<typeof row>

/** A fake /shipments-history honouring ONLY the documented parameters. */
function fakeHistory(rows: Row[]) {
  let calls = 0
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== 'shipments-history') throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !HISTORY_KEYS.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = Number(q.page)
    if (q.page === undefined || !Number.isInteger(page) || page < 0) {
      throw new Error('400: Invalid page argument, must be zero or above.')
    }
    if (q.searchField !== undefined && !SEARCH_FIELDS.has(String(q.searchField))) {
      throw new Error(`400: searchField ${String(q.searchField)}`)
    }
    let matching = rows
    if (q.searchField && q.searchValue !== undefined) {
      const field = String(q.searchField) === 'shipmentId' ? 'id' : String(q.searchField)
      matching = rows.filter((r) => (r as Record<string, unknown>)[field] === q.searchValue)
    }
    return {
      minDelay: 100,
      page,
      totalPages: Math.ceil(matching.length / UPSTREAM),
      shipments: matching.slice(page * UPSTREAM, (page + 1) * UPSTREAM),
    }
  })
  return rows.map((r) => r.id)
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(5666306 + i))

beforeEach(() => {
  getMock.mockReset()
  _resetRowPager()
})

describe('nshift listShipments: GET /shipments-history via pageByRows', () => {
  it('serves every row once across pages 1..3 with exact hasMore (upstream 50 + 11)', async () => {
    const expected = fakeHistory(ids(N).map((id) => row(id)))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await new NShiftAdapter().listShipments(CREDS, params)
      seen.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('asks for zero-based upstream pages and nothing but documented params', async () => {
    fakeHistory(ids(N).map((id) => row(id)))
    await new NShiftAdapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    const sent = getMock.mock.calls.map((c) => c[1] as Record<string, unknown>)
    // Rows 30..59 straddle upstream page 0 (rows 0..49) and page 1 (rows 50..60).
    expect(sent).toEqual([{ page: 0 }, { page: 1 }])
  })

  it('a caller page larger than 50 walks upstream pages until the end', async () => {
    const expected = fakeHistory(ids(N).map((id) => row(id)))
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await new NShiftAdapter().listShipments(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty history is one request and hasMore false', async () => {
    fakeHistory([])
    const params = withPageSink({ page: 1, limit: L })
    expect(await new NShiftAdapter().listShipments(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('sends search as the documented searchField=orderNo + searchValue pair', async () => {
    fakeHistory([row('1', 'A-1'), row('2', 'B-2')])
    const rows = await new NShiftAdapter().listShipments(
      CREDS,
      withPageSink({ page: 1, limit: L, search: 'B-2' }),
    )
    expect(rows.map((r) => r.id)).toEqual(['2'])
    expect(getMock.mock.calls[0]![1]).toEqual({
      page: 0,
      searchField: 'orderNo',
      searchValue: 'B-2',
    })
  })

  it('rows parse against ShipmentSchema', async () => {
    fakeHistory(ids(3).map((id) => row(id)))
    const rows = await new NShiftAdapter().listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    for (const r of rows) ShipmentSchema.parse(r)
  })

  it('a full last page of exactly 50 ends on totalPages, with no extra request', async () => {
    fakeHistory(ids(UPSTREAM).map((id) => row(id)))
    const params = withPageSink({ page: 1, limit: UPSTREAM })
    const rows = await new NShiftAdapter().listShipments(CREDS, params)
    expect(rows).toHaveLength(UPSTREAM)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('a page with no rows ends the walk even without totalPages', async () => {
    getMock.mockResolvedValue({ page: 0, shipments: [] })
    const params = withPageSink({ page: 1, limit: L })
    expect(await new NShiftAdapter().listShipments(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a search walk never reuses rows an unfiltered walk cached on the same connection', async () => {
    // 40 rows with orderNo 'A', then 21 with 'B'. No _resetRowPager between the calls.
    fakeHistory(ids(N).map((id, i) => row(id, i < 40 ? 'A' : 'B')))
    const adapter = new NShiftAdapter()
    await adapter.listShipments(CREDS, withPageSink({ page: 1, limit: L }))
    const params = withPageSink({ page: 2, limit: L, search: 'A' })
    const rows = await adapter.listShipments(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(ids(40).slice(30))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(getMock.mock.calls.at(-1)![1]).toEqual({
      page: 0,
      searchField: 'orderNo',
      searchValue: 'A',
    })
  })

  it('throws instead of guessing an end when the response carries no totalPages', async () => {
    getMock.mockResolvedValue({ page: 0, shipments: [row('1')] })
    await expect(
      new NShiftAdapter().listShipments(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/totalPages/)
  })
})

describe('nshift getShipment reads back a listed id through /shipments-history', () => {
  it('looks the id up with searchField=shipmentId on page 0', async () => {
    fakeHistory(ids(3).map((id) => row(id)))
    const s = await new NShiftAdapter().getShipment(CREDS, '5666307')
    expect(s.id).toBe('5666307')
    ShipmentSchema.parse(s)
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]![0]).toBe('shipments-history')
    expect(getMock.mock.calls[0]![1]).toEqual({
      page: 0,
      searchField: 'shipmentId',
      searchValue: '5666307',
    })
  })

  it('returns only the row whose id equals the requested id, whatever else the search returns', async () => {
    // The docs do not say searchValue is an exact match, so the adapter checks the id itself.
    getMock.mockResolvedValue({
      page: 0,
      totalPages: 1,
      shipments: [row('56663061'), row('5666306'), row('15666306')],
    })
    const s = await new NShiftAdapter().getShipment(CREDS, '5666306')
    expect(s.id).toBe('5666306')
  })

  it('answers 404 when the search returns rows but none carries the id', async () => {
    getMock.mockResolvedValue({ page: 0, totalPages: 1, shipments: [row('56663061')] })
    await expect(new NShiftAdapter().getShipment(CREDS, '5666306')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('answers 404 when no row carries the id', async () => {
    fakeHistory([row('1')])
    await expect(new NShiftAdapter().getShipment(CREDS, '999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('nshift refusals send no request', () => {
  const refused: Array<[string, (a: NShiftAdapter, p: QueryParams) => Promise<unknown>]> = [
    ['listLabels', (a, p) => a.listLabels(CREDS, p)],
    ['getLabel', (a) => a.getLabel(CREDS, '5666306')],
    ['listManifests', (a, p) => a.listManifests(CREDS, p)],
    ['getManifest', (a) => a.getManifest(CREDS, '11781')],
  ]
  it.each(refused)('%s throws 501 NOT_SUPPORTED', async (_name, call) => {
    await expect(
      call(new NShiftAdapter(), withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
  })
})
