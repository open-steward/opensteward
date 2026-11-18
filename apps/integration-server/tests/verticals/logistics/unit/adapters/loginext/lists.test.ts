/**
 * LogiNext reads, against a fake that honours only the documented Order "Get"
 * API (https://raw.githubusercontent.com/loginextsolutions/docs/master/source/index.html.md):
 *
 *   GET https://api.loginextsolutions.com/ShipmentApp/mile/v1/shipment
 *   start_date / end_date ("Conditional Mandatory | If order_no is not passed
 *   in the request, then this field is mandatory", "Format 'yyyy-MM-dd
 *   HH:mm:ss'"), status, order_no, orderReferenceId, page_no (default 1),
 *   page_size (default 50, "The maximum accepted value is 100"),
 *   customer_code, employee_id. The response carries `moreResultsExists`.
 *
 * Every request needs "WWW-Authenticate | BASIC <token>".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { LoginextAdapter } from '../../../../../../src/verticals/logistics/adapters/loginext/index'
import type { LoginextOrder } from '../../../../../../src/verticals/logistics/adapters/loginext/transform/order'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { docOrderRow } from './fixtures'

// 2026-09-24T10:00:00Z
const NOW = Date.UTC(2026, 8, 24, 10, 0, 0)
const PATH = '/ShipmentApp/mile/v1/shipment'
const DOCUMENTED = [
  'start_date',
  'end_date',
  'status',
  'order_no',
  'orderReferenceId',
  'page_no',
  'page_size',
  'customer_code',
  'employee_id',
]
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

type Params = Record<string, unknown>
type Call = { path: string; params: Params }

let calls: Call[]
let createConfigs: Array<{ baseURL?: unknown; headers?: Record<string, unknown> }>
let store: LoginextOrder[]

function row(n: number): LoginextOrder {
  return { ...docOrderRow(), orderNo: `ORD-${n}`, referenceId: `ref${n}` }
}

/** The documented Order Get API over `store`. */
function orderGet(path: string, params: Params): unknown {
  if (path !== PATH) throw new Error(`undocumented path ${path}`)
  for (const k of Object.keys(params)) {
    if (!DOCUMENTED.includes(k)) throw new Error(`undocumented parameter ${k}`)
  }
  if (params.order_no !== undefined) {
    const hit = store.filter((r) => r.orderNo === params.order_no)
    return { status: 200, message: 'SUCCESS', moreResultsExists: false, data: hit, hasError: false }
  }
  for (const k of ['start_date', 'end_date']) {
    if (typeof params[k] !== 'string' || !DATE_FORMAT.test(params[k] as string)) {
      return { status: 400, message: `${k} is mandatory`, data: null, hasError: true }
    }
  }
  const pageNo = (params.page_no as number | undefined) ?? 1
  const pageSize = Math.min((params.page_size as number | undefined) ?? 50, 100)
  const start = (pageNo - 1) * pageSize
  const data = store.slice(start, start + pageSize)
  return {
    status: 200,
    message: 'SUCCESS',
    moreResultsExists: start + pageSize < store.length,
    data,
    hasError: false,
  }
}

const creds = { accessToken: '51bbe3f7-1671-476c-818a-e7fbbca10202' }
const after = new Date('2026-09-01T12:34:56.789Z')

beforeEach(() => {
  calls = []
  createConfigs = []
  store = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    createConfigs.push(cfg as (typeof createConfigs)[number])
    return {
      get: vi.fn(async (path: string, opts?: { params?: Params }) => {
        const params = opts?.params ?? {}
        calls.push({ path, params })
        return { data: orderGet(path, params) }
      }),
      post: vi.fn(async () => {
        throw new Error('the Order Get API is a GET')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('loginext client', () => {
  it('sends the documented base URL and WWW-Authenticate: BASIC <token>', async () => {
    store = [row(1)]
    await new LoginextAdapter().listOrders(creds, { page: 1, limit: 10, updatedAfter: after })
    expect(createConfigs[0]!.baseURL).toBe('https://api.loginextsolutions.com')
    expect(createConfigs[0]!.headers!['WWW-Authenticate']).toBe(
      'BASIC 51bbe3f7-1671-476c-818a-e7fbbca10202',
    )
    expect(calls[0]!.path).toBe(PATH)
  })

  it('does not double the BASIC keyword on a token pasted with it', async () => {
    store = [row(1)]
    await new LoginextAdapter().listOrders(
      { accessToken: 'BASIC abc' },
      { page: 1, limit: 10, updatedAfter: after },
    )
    expect(createConfigs[0]!.headers!['WWW-Authenticate']).toBe('BASIC abc')
  })
})

describe.each([
  ['listOrders', 'orders'],
  ['listShipments', 'shipments'],
] as const)('loginext %s', (method, resource) => {
  const list = (params: Params) =>
    new LoginextAdapter()[method](creds, params as never) as Promise<Array<{ id?: string }>>

  it('refuses without updatedAfter, before sending anything', async () => {
    store = [row(1)]
    await expect(list({ page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining(`cannot list ${resource} without updated_after`),
    })
    expect(calls).toHaveLength(0)
  })

  it('sends the window, status=ALL and the caller page and limit', async () => {
    store = [row(1)]
    await list({ page: 1, limit: 25, updatedAfter: after })
    expect(calls).toEqual([
      {
        path: PATH,
        params: {
          start_date: '2026-09-01 12:34:56',
          end_date: '2026-09-24 23:59:59',
          status: 'ALL',
          page_no: 1,
          page_size: 25,
        },
      },
    ])
  })

  it('sends the documented default page_size of 50 when the caller gives no limit', async () => {
    store = [row(1)]
    const params = withPageSink({ page: 1, updatedAfter: after })
    await list(params)
    expect(calls[0]!.params.page_size).toBe(50)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('rejects an invalid updatedAfter with 400, before sending anything', async () => {
    store = [row(1)]
    await expect(
      list({ page: 1, limit: 10, updatedAfter: new Date('not a date') }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' })
    expect(calls).toHaveLength(0)
  })

  it('asks the same window on every call the same UTC day', async () => {
    store = [row(1)]
    await list({ page: 1, limit: 5, updatedAfter: after })
    vi.setSystemTime(Date.UTC(2026, 8, 24, 23, 0, 0))
    await list({ page: 1, limit: 5, updatedAfter: after })
    expect(calls[1]!.params).toEqual(calls[0]!.params)
  })

  it(`walks 2L+1 ${resource}: every id once, hasMore exact`, async () => {
    const L = 3
    store = Array.from({ length: 2 * L + 1 }, (_, i) => row(i + 1))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter: after })
      const items = await list(params)
      for (const it of items) seen.push(it.id!)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.orderNo))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.params.page_no)).toEqual([1, 2, 3])
    expect(calls.every((c) => c.params.page_size === L)).toBe(true)
  })

  it('clamps the page size to the documented 100 and reports it', async () => {
    store = Array.from({ length: 150 }, (_, i) => row(i + 1))
    const params = withPageSink({ page: 1, limit: 250, updatedAfter: after })
    const items = await list(params)
    expect(calls[0]!.params.page_size).toBe(100)
    expect(items).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })

  it('reports no pageSize when the limit fits', async () => {
    store = [row(1)]
    const params = withPageSink({ page: 1, limit: 100, updatedAfter: after })
    await list(params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('answers an updatedAfter past today with an empty last page and no request', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-25T00:00:00Z'),
    })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['a non-200 status', { status: 409, message: 'Request Error', data: null, hasError: true }],
    ['hasError alone', { message: 'Request Error', data: [], hasError: true }],
    [
      'a non-200 status alone',
      { status: 409, message: 'Request Error', data: [], hasError: false },
    ],
    [
      'a success envelope without a data array',
      { status: 200, message: 'SUCCESS', hasError: false },
    ],
  ])('treats %s as an upstream error, not an empty page', async (_label, envelope) => {
    vi.mocked(axios.create).mockImplementation(
      () =>
        ({
          get: vi.fn(async () => ({ data: envelope })),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(list({ page: 1, limit: 10, updatedAfter: after })).rejects.toMatchObject({
      statusCode: 502,
    })
  })

  it('parses every row with the canonical schema', async () => {
    store = [row(1), row(2)]
    const items = await list({ page: 1, limit: 10, updatedAfter: after })
    for (const item of items) {
      if (method === 'listOrders') expect(() => OrderSchema.parse(item)).not.toThrow()
      else expect(() => ShipmentSchema.parse(item)).not.toThrow()
    }
  })
})

describe.each([
  ['getOrder', OrderSchema],
  ['getShipment', ShipmentSchema],
] as const)('loginext %s', (method, schema) => {
  it('looks the order up by order_no alone, which needs no date range', async () => {
    store = [row(1), row(2)]
    const got = await new LoginextAdapter()[method](creds, 'ORD-2')
    expect(calls).toEqual([{ path: PATH, params: { order_no: 'ORD-2' } }])
    const parsed = schema === OrderSchema ? OrderSchema.parse(got) : ShipmentSchema.parse(got)
    expect(parsed.id).toBe('ORD-2')
  })

  it('reads back an id that a list returned', async () => {
    store = [row(1), row(2)]
    const adapter = new LoginextAdapter()
    const listed =
      method === 'getOrder'
        ? await adapter.listOrders(creds, { page: 1, limit: 10, updatedAfter: after })
        : await adapter.listShipments(creds, { page: 1, limit: 10, updatedAfter: after })
    const got = await adapter[method](creds, listed[1]!.id!)
    expect(got.id).toBe(listed[1]!.id)
  })

  it('throws 404 when no order has that number', async () => {
    store = [row(1)]
    await expect(new LoginextAdapter()[method](creds, 'NOPE')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('never returns a different order than the one asked for', async () => {
    vi.mocked(axios.create).mockImplementation(
      () =>
        ({
          get: vi.fn(async () => ({
            data: { status: 200, moreResultsExists: false, data: [row(9)], hasError: false },
          })),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(new LoginextAdapter()[method](creds, 'ORD-2')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('loginext tracking events', () => {
  it('listTrackingEvents refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(
      new LoginextAdapter().listTrackingEvents(creds, { page: 1, limit: 10, updatedAfter: after }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(createConfigs).toHaveLength(0)
  })

  it('getTrackingEvents refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    await expect(new LoginextAdapter().getTrackingEvents(creds, 'GR432U5')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
    expect(createConfigs).toHaveLength(0)
  })
})
