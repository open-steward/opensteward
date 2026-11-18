/**
 * Pochta Rossii has no account-wide shipment list. The Otpravka specification
 * documents the shipments of one партия, paged like the партии themselves:
 * https://otpravka.pochta.ru/static/views/specification/batches-get_info_about_orders_in_batch.html
 *   "name Наименование партии", "size Количество записей на странице (Опционально)",
 *   "page Номер страницs (0..N) (Опционально)", "/1.0/batch/{name}/shipment", "GET"
 * https://otpravka.pochta.ru/static/views/specification/batches-search_all_batches.html
 *   "/1.0/batch", same size and page.
 * listShipments walks every batch, then every batch's shipments. listOrders
 * walks the same records ("Запрос данных о заказах в партии") as orders.
 *
 * listTrackingEvents and getTrackingEvents have no documented Otpravka
 * endpoint and refuse before sending anything.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PochtaRussiaAdapter } from '../../../../../../src/verticals/logistics/adapters/pochta-russia/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'tok', refreshToken: 'dXNlcjpwYXNz' }
const CALL_BUDGET = 150
const ADAPTER_MAX = 100

type Layout = Record<string, number>

/** Shipment ids are `<batch>/<n>`, n from 1, so order is checkable. */
function allIds(layout: Layout): string[] {
  return Object.entries(layout).flatMap(([b, n]) =>
    Array.from({ length: n }, (_, i) => `${b}/${i + 1}`),
  )
}

/**
 * A fake Otpravka honouring ONLY the documented parameters: `size` and a
 * 0-based `page` on GET /1.0/batch (plus mailType, mailCategory, sort) and on
 * GET /1.0/batch/{name}/shipment (plus sort). Anything else throws.
 */
function fakeOtpravka(layout: Layout) {
  const names = Object.keys(layout)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    const params = cfg?.params ?? {}
    const size = Number(params.size)
    const page = Number(params.page ?? 0)
    if (path === '/batch') {
      for (const k of Object.keys(params))
        if (!['size', 'page', 'mailType', 'mailCategory', 'sort'].includes(k))
          throw new Error(`undocumented param ${k}`)
      return {
        data: names
          .slice(page * size, page * size + size)
          .map((n) => ({ 'batch-name': n, 'batch-status': 'CREATED' })),
      }
    }
    const m = /^\/batch\/([^/]+)\/shipment$/.exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(params))
      if (!['size', 'page', 'sort'].includes(k)) throw new Error(`undocumented param ${k}`)
    const name = decodeURIComponent(m[1]!)
    const n = layout[name]
    if (n === undefined) throw new Error(`no batch ${name}`)
    const rows = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      barcode: `${name}/${i + 1}`,
      'batch-name': name,
    }))
    return { data: rows.slice(page * size, page * size + size) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const list = (p: QueryParams) => new PochtaRussiaAdapter().listShipments(CREDS, p)

async function walk(limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: boolean[] = []
  const reported: Array<boolean | undefined> = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const env = listPage(await list(params), params, 'pochta-russia')
    for (const s of env.data) ShipmentSchema.parse(s)
    seen.push(...env.data.map((s) => s.trackingNumber!))
    hasMore.push(env.meta.hasMore as boolean)
    reported.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore, reported }
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('pochta-russia listShipments walks batches, then each batch’s shipments', () => {
  it('2L+1 shipments over uneven batches: every id once, in order, hasMore exact', async () => {
    const L = 4
    // 9 = 2L+1 shipments; batch A fills one upstream page and a short one,
    // B is short, C is empty, D holds the last row.
    const layout = { A: 5, B: 3, C: 0, D: 1 }
    const { get } = fakeOtpravka(layout)
    const { seen, hasMore, reported } = await walk(L, 3)
    expect(seen).toEqual(allIds(layout))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
    // The batch list is read once, at the adapter's batch page size.
    expect(get.mock.calls.filter((c) => c[0] === '/batch')).toEqual([
      ['/batch', { params: { size: ADAPTER_MAX, page: 0 } }],
    ])
    expect(get.mock.calls.map((c) => c[0])).toContain('/batch/A/shipment')
    expect(get.mock.calls).toContainEqual(['/batch/A/shipment', { params: { size: L, page: 1 } }])
  })

  it('exactly 2L shipments: the full last page reports no more', async () => {
    const L = 3
    const layout = { A: 3, B: 3 }
    fakeOtpravka(layout)
    const { seen, hasMore } = await walk(L, 2)
    expect(seen).toEqual(allIds(layout))
    expect(hasMore).toEqual([true, false])
  })

  it('follows a full batch page to the next batch page', async () => {
    // More batches than one batch page holds.
    const layout: Layout = {}
    for (let i = 1; i <= ADAPTER_MAX + 1; i++) layout[`b${String(i).padStart(3, '0')}`] = 1
    const { get } = fakeOtpravka(layout)
    const { seen, hasMore } = await walk(60, 2)
    expect(seen).toEqual(allIds(layout))
    expect(hasMore).toEqual([true, false])
    expect(get.mock.calls.filter((c) => c[0] === '/batch').map((c) => c[1])).toEqual([
      { params: { size: ADAPTER_MAX, page: 0 } },
      { params: { size: ADAPTER_MAX, page: 1 } },
    ])
  })

  it('no batches: an empty page with no more', async () => {
    fakeOtpravka({})
    const params = withPageSink({ page: 1, limit: 5 })
    const env = listPage(await list(params), params, 'pochta-russia')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('a limit above the adapter maximum clamps the upstream size and still fills the page', async () => {
    const layout = { A: 250 }
    const { get } = fakeOtpravka(layout)
    const { seen, hasMore } = await walk(150, 2)
    expect(seen).toEqual(allIds(layout))
    expect(hasMore).toEqual([true, false])
    for (const c of get.mock.calls.filter((c) => c[0] !== '/batch'))
      expect((c[1] as { params: { size: number } }).params.size).toBe(ADAPTER_MAX)
  })

  it('walks at different limits on one connection without mixing their cursors', async () => {
    // No _resetRowPager between the walks: the cursor's {index, page} counts
    // upstream pages of the caller-sized `size`, so each limit needs its own key.
    const layout = { A: 7, B: 5 }
    fakeOtpravka(layout)
    const ids = allIds(layout)
    const at = async (page: number, limit: number) =>
      (await list(withPageSink({ page, limit }))).map((s) => s.trackingNumber)
    expect(await at(1, 3)).toEqual(ids.slice(0, 3))
    expect(await at(2, 3)).toEqual(ids.slice(3, 6))
    expect(await at(3, 3)).toEqual(ids.slice(6, 9))
    expect(await at(2, 2)).toEqual(ids.slice(2, 4))
    expect(await at(4, 2)).toEqual(ids.slice(6, 8))
    expect(await at(3, 4)).toEqual(ids.slice(8, 12))
  })

  it('escapes the batch name in the path', async () => {
    const { get } = fakeOtpravka({ 'a b': 1 })
    await list(withPageSink({ page: 1, limit: 5 }))
    expect(get.mock.calls.map((c) => c[0])).toContain('/batch/a%20b/shipment')
  })
})

describe('pochta-russia listOrders walks the orders in each batch', () => {
  const orders = (p: QueryParams) => new PochtaRussiaAdapter().listOrders(CREDS, p)

  it('2L+1 orders over uneven batches: every id once, hasMore exact, OrderSchema-valid', async () => {
    const L = 4
    const layout = { A: 5, B: 3, C: 0, D: 1 }
    const { get } = fakeOtpravka(layout)
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const env = listPage(await orders(params), params, 'pochta-russia')
      for (const o of env.data) OrderSchema.parse(o)
      seen.push(
        ...env.data.map((o) => `${(o.metadata as { 'batch-name': string })['batch-name']}/${o.id}`),
      )
      hasMore.push(env.meta.hasMore as boolean)
      expect(readUpstreamPage(params)?.hasMore).toBe(env.meta.hasMore)
    }
    expect(seen).toEqual(allIds(layout))
    expect(hasMore).toEqual([true, true, false])
    expect(get.mock.calls).toContainEqual(['/batch', { params: { size: ADAPTER_MAX, page: 0 } }])
    expect(get.mock.calls).toContainEqual(['/batch/A/shipment', { params: { size: L, page: 1 } }])
  })

  it('each order points at the shipment getShipment reads by the same id', async () => {
    fakeOtpravka({ A: 1 })
    const [o] = await orders(withPageSink({ page: 1, limit: 5 }))
    expect(o).toMatchObject({ id: '1', shipmentIds: ['1'] })
  })
})

describe('pochta-russia methods with no documented endpoint refuse before sending', () => {
  const cases: Array<[string, (a: PochtaRussiaAdapter) => Promise<unknown>]> = [
    ['listTrackingEvents', (a) => a.listTrackingEvents(CREDS, { page: 1, limit: 10 })],
    ['getTrackingEvents', (a) => a.getTrackingEvents(CREDS, '80083273150426')],
  ]
  for (const [name, call] of cases) {
    it(`${name} throws 501 NOT_SUPPORTED and sends no request`, async () => {
      const { get } = fakeOtpravka({ A: 1 })
      await expect(call(new PochtaRussiaAdapter())).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(get).not.toHaveBeenCalled()
    })
  }
})
