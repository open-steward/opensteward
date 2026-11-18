/**
 * Cafe24 reads rebuilt onto documented endpoints:
 *
 *   listLocations / getLocation → GET /shippingorigins, /shippingorigins/{origin_code}
 *     (Cafe24 documents no warehouses resource)
 *   listCustomers / getCustomer → GET /customersprivacy, /customersprivacy/{member_id}
 *     (GET /customers is a lookup that requires cellphone or member_id)
 *   listRefunds / getRefund     → GET /refunds, /refunds/{refund_code}
 *     (no per-order refunds list is documented; GET /refunds requires
 *     start_date and end_date)
 *
 * The fake answers only the documented paths and refuses, with a 422, any
 * query parameter the endpoint does not document or a value outside its
 * documented range. Parameter sets and ranges are copied from each endpoint's
 * parameter schema on apidocs.cafe24.com:
 *
 *   shippingorigins:  offset {0..8000}, limit {1..100, default 10}
 *   customersprivacy: shop_no, search_type, created_start_date, member_id,
 *                     news_mail, sms, thirdparty_agree, group_no, search_field,
 *                     keyword, date_type, start_date, end_date, member_type,
 *                     member_class, residence, gender, member_authority,
 *                     join_path, use_mobile_app, fixed_group, is_simple_join,
 *                     limit {1..1000, default 30}, offset {0..8000}
 *   refunds:          shop_no, start_date (required), end_date (required),
 *                     date_type, member_email, buyer_email, order_id, member_id,
 *                     refund_status, limit {1..500, default 10}, offset {0..15000}
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { Cafe24Adapter } from '../../../../../../src/verticals/ecommerce/adapters/cafe24/index'

const CREDS = { accessToken: 'cafe24_test' }

interface ListSpec {
  path: string
  key: string
  params: readonly string[]
  required?: readonly string[]
  limitMax: number
  limitDefault: number
  offsetMax: number
  row: (i: number) => Record<string, unknown>
}

const SHIPPINGORIGINS: ListSpec = {
  path: 'shippingorigins',
  key: 'shippingorigins',
  params: ['offset', 'limit'],
  limitMax: 100,
  limitDefault: 10,
  offsetMax: 8000,
  row: (i) => ({ origin_code: `W${String(i).padStart(7, '0')}`, origin_name: `Warehouse ${i}` }),
}

const CUSTOMERSPRIVACY: ListSpec = {
  path: 'customersprivacy',
  key: 'customersprivacy',
  params: [
    'shop_no',
    'search_type',
    'created_start_date',
    'member_id',
    'news_mail',
    'sms',
    'thirdparty_agree',
    'group_no',
    'search_field',
    'keyword',
    'date_type',
    'start_date',
    'end_date',
    'member_type',
    'member_class',
    'residence',
    'gender',
    'member_authority',
    'join_path',
    'use_mobile_app',
    'fixed_group',
    'is_simple_join',
    'limit',
    'offset',
  ],
  limitMax: 1000,
  limitDefault: 30,
  offsetMax: 8000,
  row: (i) => ({ member_id: `member${i}`, name: `Member ${i}` }),
}

const REFUNDS: ListSpec = {
  path: 'refunds',
  key: 'refunds',
  params: [
    'shop_no',
    'start_date',
    'end_date',
    'date_type',
    'member_email',
    'buyer_email',
    'order_id',
    'member_id',
    'refund_status',
    'limit',
    'offset',
  ],
  required: ['start_date', 'end_date'],
  limitMax: 500,
  limitDefault: 10,
  offsetMax: 15000,
  row: (i) => ({
    order_id: `20260101-${String(i).padStart(7, '0')}`,
    refund_code: `C20260101-${String(i).padStart(7, '0')}`,
    actual_refund_amount: '1000.00',
    currency: 'KRW',
  }),
}

function reject(message: string): never {
  throw Object.assign(new Error(message), { response: { status: 422 } })
}

/** A fake Cafe24 serving `total` rows of one list endpoint, plus any single-resource paths. */
function fakeCafe24(spec: ListSpec, total: number, singles: Record<string, unknown> = {}) {
  const queries: Record<string, unknown>[] = []
  const paths: string[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    paths.push(path)
    if (path in singles) return { data: singles[path] }
    if (path !== spec.path)
      throw Object.assign(new Error(`unexpected ${path}`), { response: { status: 404 } })
    const p = config?.params ?? {}
    queries.push({ ...p })
    for (const k of Object.keys(p))
      if (!spec.params.includes(k)) reject(`undocumented parameter ${k}`)
    for (const k of spec.required ?? []) if (p[k] === undefined) reject(`${k} is required`)
    const limit = p['limit'] ?? spec.limitDefault
    const offset = p['offset'] ?? 0
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > spec.limitMax)
      reject(`limit out of range: ${String(limit)}`)
    if (
      typeof offset !== 'number' ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > spec.offsetMax
    )
      reject(`offset out of range: ${String(offset)}`)
    const rows = Array.from({ length: total }, (_, i) => spec.row(i + 1))
    return { data: { [spec.key]: rows.slice(offset, offset + limit) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { get, queries, paths }
}

const adapter = () =>
  new Cafe24Adapter({
    clientId: 'id',
    clientSecret: 'secret',
    redirectUri: 'https://x.test/cb',
    mallId: 'mall',
  })

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const UPDATED_AFTER = new Date('2026-09-01T03:04:05.000Z')

const LISTS = [
  {
    name: 'listLocations',
    spec: SHIPPINGORIGINS,
    extra: {},
    call: (a: Cafe24Adapter, p: QueryParams) => a.listLocations(CREDS, p),
    id: (i: number) => `W${String(i).padStart(7, '0')}`,
  },
  {
    name: 'listCustomers',
    spec: CUSTOMERSPRIVACY,
    extra: {},
    call: (a: Cafe24Adapter, p: QueryParams) => a.listCustomers(CREDS, p),
    id: (i: number) => `member${i}`,
  },
  {
    name: 'listRefunds',
    spec: REFUNDS,
    extra: { updatedAfter: UPDATED_AFTER },
    call: (a: Cafe24Adapter, p: QueryParams) => a.listRefunds(CREDS, p),
    id: (i: number) => `C20260101-${String(i).padStart(7, '0')}`,
  },
] as const

describe.each(LISTS)('cafe24 $name', ({ spec, extra, call, id }) => {
  const ids = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => id(start + i))

  it.each([10, 7])(
    'N = 2L + 1 rows (limit %i) serve every id once, in order, with exact hasMore',
    async (limit) => {
      const n = 2 * limit + 1
      fakeCafe24(spec, n)
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit, ...extra })
        seen.push(...(await call(adapter(), params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(1, n))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it(`calls ${spec.path} with offset = (P - 1) * L and the caller limit`, async () => {
    const { queries, paths } = fakeCafe24(spec, 50)
    const rows = await call(adapter(), withPageSink({ page: 3, limit: 10, ...extra }))
    expect(paths).toEqual([spec.path])
    expect(rows.map((r) => r.id)).toEqual(ids(21, 10))
    expect(queries[0]).toMatchObject({ limit: 10, offset: 20 })
  })

  it('clamps a limit above the 100-row request limit and reports the size sent', async () => {
    const { queries } = fakeCafe24(spec, 250)
    const params = withPageSink({ page: 2, limit: 250, ...extra })
    const rows = await call(adapter(), params)
    expect(queries[0]).toMatchObject({ limit: 100, offset: 100 })
    expect(rows.map((r) => r.id)).toEqual(ids(101, 100))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })
})

describe('cafe24 listCustomers and listLocations send only documented parameters', () => {
  it('listCustomers does not send updated_start_date, which customersprivacy does not document', async () => {
    const { queries } = fakeCafe24(CUSTOMERSPRIVACY, 5)
    await adapter().listCustomers(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER }),
    )
    expect(queries).toEqual([{ limit: 10, offset: 0 }])
  })

  it('listLocations does not send updated_start_date, which shippingorigins does not document', async () => {
    const { queries } = fakeCafe24(SHIPPINGORIGINS, 5)
    await adapter().listLocations(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER }),
    )
    expect(queries).toEqual([{ limit: 10, offset: 0 }])
  })
})

describe('cafe24 listRefunds date range', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-25T15:00:00.000Z'))
  })

  it('refuses an unfiltered call with 501 NOT_SUPPORTED before sending anything', async () => {
    const { get } = fakeCafe24(REFUNDS, 5)
    await expect(
      adapter().listRefunds(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('start_date and end_date'),
    })
    expect(get).not.toHaveBeenCalled()
  })

  it('refuses an Invalid Date updatedAfter with 501 NOT_SUPPORTED before sending anything', async () => {
    const { get } = fakeCafe24(REFUNDS, 5)
    await expect(
      adapter().listRefunds(
        CREDS,
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('not a date') }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('sends start_date from updatedAfter and end_date at the end of the current UTC day', async () => {
    const { queries } = fakeCafe24(REFUNDS, 5)
    await adapter().listRefunds(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER }),
    )
    expect(queries).toEqual([
      {
        limit: 10,
        offset: 0,
        start_date: '2026-09-01T03:04:05+00:00',
        end_date: '2026-09-25T23:59:59+00:00',
      },
    ])
  })

  it('page 2 later the same day is the same window, one page on', async () => {
    const { queries } = fakeCafe24(REFUNDS, 30)
    await adapter().listRefunds(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER }),
    )
    vi.setSystemTime(new Date('2026-09-25T23:59:00.000Z'))
    await adapter().listRefunds(
      CREDS,
      withPageSink({ page: 2, limit: 10, updatedAfter: UPDATED_AFTER }),
    )
    expect(queries[1]).toEqual({ ...queries[0], offset: 10 })
  })

  it('forwards a caller order id as the documented order_id filter', async () => {
    const { queries } = fakeCafe24(REFUNDS, 5)
    await adapter().listRefunds(
      CREDS,
      withPageSink({
        page: 1,
        limit: 10,
        updatedAfter: UPDATED_AFTER,
        order_id: '20191121-0000032',
      }),
    )
    expect(queries[0]).toMatchObject({ order_id: '20191121-0000032' })
  })
})

describe('cafe24 single reads', () => {
  it('getLocation reads GET /shippingorigins/{origin_code}', async () => {
    const { paths } = fakeCafe24(SHIPPINGORIGINS, 0, {
      'shippingorigins/W000000Q': {
        shippingorigin: { origin_code: 'W000000Q', origin_name: 'Dongjak-gu Warehouse' },
      },
    })
    const loc = await adapter().getLocation(CREDS, 'W000000Q')
    expect(paths).toEqual(['shippingorigins/W000000Q'])
    expect(loc).toMatchObject({ id: 'W000000Q', name: 'Dongjak-gu Warehouse' })
  })

  it('getCustomer reads GET /customersprivacy/{member_id}', async () => {
    const { paths } = fakeCafe24(CUSTOMERSPRIVACY, 0, {
      'customersprivacy/sampleid': {
        customersprivacy: { member_id: 'sampleid', email: 'sample@sample.com' },
      },
    })
    const c = await adapter().getCustomer(CREDS, 'sampleid')
    expect(paths).toEqual(['customersprivacy/sampleid'])
    expect(c).toMatchObject({ id: 'sampleid', email: 'sample@sample.com' })
  })

  it('getRefund reads GET /refunds/{refund_code}, the id a list row returns', async () => {
    const { paths } = fakeCafe24(REFUNDS, 0, {
      'refunds/C20191118-0000001': {
        refund: {
          order_id: '20191118-0000018',
          refund_code: 'C20191118-0000001',
          currency: 'KRW',
          refund_amount: '17610.00',
        },
      },
    })
    const r = await adapter().getRefund(CREDS, 'C20191118-0000001')
    expect(paths).toEqual(['refunds/C20191118-0000001'])
    expect(r).toMatchObject({
      id: 'C20191118-0000001',
      orderId: '20191118-0000018',
      amount: { amount: 17610, currency: 'KRW' },
    })
  })
})
