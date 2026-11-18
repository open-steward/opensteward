/**
 * Terminal Africa listShipments / listTrackingEvents over GET /v1/shipments.
 *
 * Both methods called v1 /shipments but read `data.shipments`, the v2 shape
 * (GET /v2/shipments), so against the documented v1 response they returned
 * nothing, and both always asked for page 1.
 *
 * First-party docs, https://docs.terminal.africa/tship/shipment/get-shipments.md
 * (GET https://api.terminal.africa/v1/shipments), query parameters:
 *   perPage  "Specify how many results will be returned in a single request. Defaults to 100."
 *   page     "Specify what page of records will be sent in response. Defaults to 1."
 *   popluate "Indicate if full details should be provided for select fields ..."
 *   status   "Must be one of cancelled, confirmed, delivered, draft, in-transit, pending"
 * Response: `data: [ ...shipments ]` and a sibling
 * `pageData: { total, perPage, page, pageCount }`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'

const { getMock, ClientCtor } = vi.hoisted(() => {
  const getMock = vi.fn()
  const ClientCtor = vi.fn().mockImplementation(function TerminalAfricaClientMock() {
    return { get: getMock }
  })
  return { getMock, ClientCtor }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/terminal-africa/client', () => ({
  TerminalAfricaClient: ClientCtor,
}))

import { TerminalAfricaAdapter } from '../../../../../../src/verticals/logistics/adapters/terminal-africa'
import type { TerminalAfricaShipment } from '../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/shipment'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { confirmedShipment, draftShipment } from './fixtures'

const CREDS = { accessToken: 'TEST_token' } as Credentials
const L = 5
const N = 2 * L + 1
const DOC_DEFAULT_PER_PAGE = 100
const ADAPTER_CAP = 100
const ADAPTER_DEFAULT = 50
const CALL_BUDGET = 40
const DOCUMENTED = new Set(['perPage', 'page', 'popluate', 'status'])

/**
 * A fake GET /v1/shipments honouring ONLY the documented query params and
 * answering in the documented v1 shape (`data` array + `pageData`).
 */
function fakeShipments(rows: TerminalAfricaShipment[]) {
  let calls = 0
  getMock.mockImplementation(async (path: string, params?: Record<string, unknown>) => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
    if (path !== 'shipments') throw new Error(`404: ${path}`)
    const q = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined))
    const bad = Object.keys(q).filter((k) => !DOCUMENTED.has(k))
    if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
    const page = q.page === undefined ? 1 : Number(q.page)
    const perPage = q.perPage === undefined ? DOC_DEFAULT_PER_PAGE : Number(q.perPage)
    if (!(Number.isInteger(page) && page >= 1)) throw new Error(`400: page ${page}`)
    if (!(Number.isInteger(perPage) && perPage >= 1)) throw new Error(`400: perPage ${perPage}`)
    const start = (page - 1) * perPage
    return {
      status: true,
      message: 'Shipments retrieved successfully',
      data: rows.slice(start, start + perPage),
      pageData: {
        total: rows.length,
        perPage,
        page,
        pageCount: Math.ceil(rows.length / perPage),
      },
    }
  })
}

function shipment(i: number, events = 0): TerminalAfricaShipment {
  return {
    ...confirmedShipment(),
    shipment_id: `SH-${i}`,
    events: Array.from({ length: events }, (_, k) => ({
      created_at: new Date(Date.UTC(2024, 0, 1, 0, k)).toISOString(),
      description: `event ${k} of SH-${i}`,
      location: 'Lagos, NG',
      status: k % 2 === 0 ? 'confirmed' : 'in-transit',
    })),
  }
}

const shipments = (n: number) => Array.from({ length: n }, (_, i) => shipment(i + 1))

beforeEach(() => {
  ClientCtor.mockClear()
  getMock.mockReset()
  _resetRowPager()
})

describe('terminal-africa listShipments', () => {
  it('reads the documented v1 `data` array (the documented example round-trips)', async () => {
    fakeShipments([draftShipment(), confirmedShipment()])
    const rows = await new TerminalAfricaAdapter().listShipments(CREDS, withPageSink({}))
    expect(rows.map((r) => ShipmentSchema.parse(r).id)).toEqual([
      'SH-40208776515',
      'SH-02314736509',
    ])
  })

  it('serves every row once, in order, across pages 1..3 with exact hasMore and total', async () => {
    const rows = shipments(N)
    fakeShipments(rows)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await new TerminalAfricaAdapter().listShipments(CREDS, params)
      seen.push(...out.map((r) => r.id!))
      const reported = readUpstreamPage(params)
      more.push(reported?.hasMore)
      expect(reported?.totalCount).toBe(N)
    }
    expect(seen).toEqual(rows.map((r) => r.shipment_id))
    expect(new Set(seen).size).toBe(N)
    expect(more).toEqual([true, true, false])
  })

  it('the page-2 request carries exactly the documented page and perPage', async () => {
    fakeShipments(shipments(N))
    await new TerminalAfricaAdapter().listShipments(CREDS, withPageSink({ page: 2, limit: L }))
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]).toEqual(['shipments', { page: 2, perPage: L }])
  })

  it('a limit above the adapter cap sends perPage 100 and reports it as the page size', async () => {
    const rows = shipments(150)
    fakeShipments(rows)
    const params = withPageSink({ page: 1, limit: 500 })
    const out = await new TerminalAfricaAdapter().listShipments(CREDS, params)
    expect((getMock.mock.calls[0] as [string, Record<string, unknown>])[1].perPage).toBe(
      ADAPTER_CAP,
    )
    expect(out).toHaveLength(ADAPTER_CAP)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: ADAPTER_CAP, totalCount: 150 }),
    )
  })

  it('with no page or limit asks for page 1 at the adapter default', async () => {
    fakeShipments(shipments(3))
    const params = withPageSink({})
    await new TerminalAfricaAdapter().listShipments(CREDS, params)
    expect(getMock.mock.calls[0]).toEqual(['shipments', { page: 1, perPage: ADAPTER_DEFAULT }])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    const rows = shipments(N)
    fakeShipments(rows)
    const params = parseListQuery({ page: '2', limit: String(L) })
    const adapter = new TerminalAfricaAdapter()
    const env = listPage(await adapter.listShipments(CREDS, params), params, 'terminal-africa')
    expect(env.data.map((r) => r.id)).toEqual(rows.slice(L, 2 * L).map((r) => r.shipment_id))
    expect(env.meta).toEqual(expect.objectContaining({ page: 2, limit: L, hasMore: true }))
  })
})

describe('terminal-africa getShipment', () => {
  it('reads GET /v1/shipments/:shipment_id `data` object, so a listed id reads back', async () => {
    getMock.mockResolvedValue({
      status: true,
      message: 'Shipment retrieved successfully.',
      data: draftShipment(),
    })
    const out = await new TerminalAfricaAdapter().getShipment(CREDS, 'SH-40208776515')
    expect(getMock.mock.calls[0]).toEqual(['shipments/SH-40208776515'])
    expect(ShipmentSchema.parse(out).id).toBe('SH-40208776515')
  })
})

describe('terminal-africa listTrackingEvents (events flattened out of shipment pages)', () => {
  /**
   * 250 shipments = upstream pages of 100, 100, 50 at the fixed perPage 100.
   * Events: page 1 holds 4 (uneven across shipments), page 2 holds none,
   * page 3 holds 7. N = 11 events in all.
   */
  function sparse(): TerminalAfricaShipment[] {
    const rows = shipments(250)
    rows[3] = shipment(4, 1)
    rows[40] = shipment(41, 3)
    rows[205] = shipment(206, 2)
    rows[230] = shipment(231, 5)
    return rows
  }

  const expectedIds = (rows: TerminalAfricaShipment[]) =>
    rows.flatMap((s) => (s.events ?? []).map((e) => `${s.shipment_id}:${e.created_at}:${e.status}`))

  it('serves every event once across pages 1..3 with exact hasMore', async () => {
    const rows = sparse()
    fakeShipments(rows)
    const expected = expectedIds(rows)
    expect(expected).toHaveLength(N)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const out = await new TerminalAfricaAdapter().listTrackingEvents(CREDS, params)
      for (const e of out) TrackingEventSchema.parse(e)
      seen.push(...out.map((e) => e.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(more).toEqual([true, true, false])
    // pageData.pageCount is 3: the walk never asks for a page past it.
    const asked = getMock.mock.calls.map((c) => (c[1] as { page: number }).page)
    expect(Math.max(...asked)).toBe(3)
  })

  it('walks upstream pages at the fixed perPage 100, whatever the caller limit', async () => {
    fakeShipments(sparse())
    await new TerminalAfricaAdapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L }))
    const sent = getMock.mock.calls.map((c) => c[1])
    expect(sent[0]).toEqual({ page: 1, perPage: 100 })
    for (const p of sent) expect(p).toEqual(expect.objectContaining({ perPage: 100 }))
  })

  it('page 2 alone reaches the events on the third upstream page', async () => {
    const rows = sparse()
    fakeShipments(rows)
    const params = withPageSink({ page: 2, limit: L })
    const out = await new TerminalAfricaAdapter().listTrackingEvents(CREDS, params)
    expect(out.map((e) => e.id)).toEqual(expectedIds(rows).slice(L, 2 * L))
    expect(getMock.mock.calls.map((c) => (c[1] as { page: number }).page)).toEqual([1, 2, 3])
  })

  it('a non-empty page without pageData throws rather than guess the end', async () => {
    getMock.mockResolvedValue({ status: true, message: '', data: [shipment(1, 2)] })
    await expect(
      new TerminalAfricaAdapter().listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toThrow(/pageData\.pageCount/)
  })

  it('an empty page without pageData ends the walk', async () => {
    getMock.mockResolvedValue({ status: true, message: '', data: [] })
    const params = withPageSink({ page: 1, limit: L })
    expect(await new TerminalAfricaAdapter().listTrackingEvents(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('an empty account yields no events and hasMore false', async () => {
    fakeShipments([])
    const params = withPageSink({ page: 1, limit: L })
    expect(await new TerminalAfricaAdapter().listTrackingEvents(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
