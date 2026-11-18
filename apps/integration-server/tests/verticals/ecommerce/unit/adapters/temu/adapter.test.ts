/**
 * Temu adapter: client envelope and signature, request shapes, paging and
 * refusals.
 *
 * Every rule the fake upstream enforces is from Temu's partner docs, fetched
 * 2026-09-25 as JSON from https://partner-us.temu.com/riemann/api/v2/...:
 *
 *   - Common Parameters: timestamp "in UNIX time format (seconds), 10 digits
 *     long"; version "If no requirement is set, this parameter is not passed".
 *   - Signature Method for API request: the worked example, whose sign is
 *     4CCF219942D4180C6DDA3CE36C1B838F.
 *   - bg.local.goods.list.query: "pageNo" and "pageSize ... with a limit of 100
 *     per page" (both required), "total", "goodsList"; goodsSearchType
 *     "Optional if at least one of goodsStatusFilterType or goodsIdList is
 *     provided".
 *   - bg.order.list.v2.get: "pageNumber", "pageSize ... max is 100",
 *     "totalItemNum", "pageItems"; updateAtStart "Must be used in conjunction
 *     with updateAtEnd", in seconds.
 *   - bg.aftersales.parentaftersales.list.get: "pageNo", "pageSize ... max is
 *     200", "total", "data"; "At least one set of creation or update times
 *     must be provided as required input parameters."
 *
 * The fake answers only the documented `type`s, rejects any request parameter
 * the type's doc page does not list, and answers in the documented envelope
 * (`success`, `errorCode`, `errorMsg`, `result`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { TemuAdapter } from '../../../../../../src/verticals/ecommerce/adapters/temu/index'
import {
  computeSign,
  TemuApiError,
} from '../../../../../../src/verticals/ecommerce/adapters/temu/client'

const SECRET = 'c7e0a1a63542be4de3cb5488f9fba8149e8fc290'
const CREDS: Credentials = {
  accessToken: 'tok-1',
  extra: { appKey: 'f9d5cc9313893a20d5aa85c654e8f503', appSecret: SECRET },
}

const COMMON = ['type', 'app_key', 'access_token', 'sign', 'timestamp', 'data_type', 'version']

/** Request parameters each documented type lists. */
const DOCUMENTED: Record<string, string[]> = {
  'bg.local.goods.list.query': [
    'pageNo',
    'pageSize',
    'orderField',
    'orderType',
    'goodsSearchType',
    'searchText',
    'statusFilterType',
    'crtFrom',
    'crtTo',
    'goodsIdList',
    'catIdList',
    'goodsStatusFilterType',
    'goodsSubStatusFilterType',
    'goodsStatusChangeTimeFrom',
    'goodsStatusChangeTimeTo',
    'goodsSearchTags',
  ],
  'bg.local.goods.detail.query': ['language', 'goodsId', 'versionQueryType'],
  'bg.order.list.v2.get': [
    'pageNumber',
    'pageSize',
    'parentOrderStatus',
    'parentOrderSnList',
    'createAfter',
    'createBefore',
    'expectShipLatestTimeStart',
    'expectShipLatestTimeEnd',
    'updateAtStart',
    'updateAtEnd',
    'parentConfirmTimeStart',
    'parentConfirmTimeEnd',
    'regionId',
    'fulfillmentTypeList',
    'parentOrderLabel',
    'packageAbnormalTypeList',
    'sortby',
    'hasPreSaleOrder',
    'hasQualificationRequiredOrder',
    'skuId',
  ],
  'bg.order.detail.v2.get': ['parentOrderSn', 'fulfillmentTypeList'],
  'bg.aftersales.parentaftersales.list.get': [
    'pageSize',
    'pageNo',
    'parentOrderSnList',
    'parentAfterSalesSnList',
    'createAtStart',
    'createAtEnd',
    'updateAtStart',
    'updateAtEnd',
    'afterSalesStatusGroup',
  ],
}

type Body = Record<string, unknown>
type Raw = Record<string, unknown>

interface Data {
  /** Goods by goodsStatusFilterType. */
  goods?: Record<number, Raw[]>
  orders?: Raw[]
  refunds?: Raw[]
}

const fail = (errorCode: number, errorMsg: string) => ({
  data: { success: false, errorCode, errorMsg },
})
const ok = (result: unknown) => ({
  data: { success: true, errorCode: 1000000, errorMsg: '', result },
})

function makeServer(data: Data) {
  const calls: Body[] = []
  const post = vi.fn(async (_path: string, body: Body) => {
    calls.push(body)
    const type = String(body['type'])
    const documented = DOCUMENTED[type]
    if (!documented) return fail(3000000, `type not found: ${type}`)
    for (const k of Object.keys(body))
      if (!COMMON.includes(k) && !documented.includes(k))
        return fail(150010003, `undocumented ${k}`)
    const { sign, ...rest } = body
    if (sign !== computeSign(rest, SECRET)) return fail(7000016, 'sign error')
    if (!/^\d{10}$/.test(String(body['timestamp']))) return fail(7000015, 'timestamp')
    const slice = (rows: Raw[], page: number, size: number) =>
      rows.slice((page - 1) * size, page * size)

    if (type === 'bg.local.goods.list.query') {
      const size = body['pageSize'] as number
      const page = body['pageNo'] as number
      if (!Number.isInteger(page) || !Number.isInteger(size) || size < 1 || size > 100)
        return fail(150010003, 'pageNo/pageSize')
      const status = body['goodsStatusFilterType'] ?? body['goodsSearchType']
      if (status === undefined && body['goodsIdList'] === undefined)
        return fail(150010003, 'status filter')
      const rows = data.goods?.[status as number] ?? []
      return ok({ pageNo: page, total: rows.length, goodsList: slice(rows, page, size) })
    }
    if (type === 'bg.order.list.v2.get') {
      const size = (body['pageSize'] as number | undefined) ?? 10
      const page = (body['pageNumber'] as number | undefined) ?? 1
      if (size > 100) return fail(140020013, 'pageSize')
      if ('updateAtStart' in body !== 'updateAtEnd' in body)
        return fail(140020013, 'updateAtEnd not passed in')
      let rows = data.orders ?? []
      if ('updateAtStart' in body) {
        const s = body['updateAtStart'] as number
        const e = body['updateAtEnd'] as number
        if (!/^\d{10}$/.test(String(s)) || !/^\d{10}$/.test(String(e)))
          return fail(140020014, 'second level timestamp')
        rows = rows.filter((r) => {
          const t = (r['parentOrderMap'] as Raw)['updateTime'] as number
          return t >= s && t <= e
        })
      }
      return ok({ totalItemNum: rows.length, pageItems: slice(rows, page, size) })
    }
    if (type === 'bg.aftersales.parentaftersales.list.get') {
      const size = (body['pageSize'] as number | undefined) ?? 10
      const page = (body['pageNo'] as number | undefined) ?? 1
      if (size > 200) return fail(130010001, 'pageSize')
      const hasCreate = 'createAtStart' in body && 'createAtEnd' in body
      const hasUpdate = 'updateAtStart' in body && 'updateAtEnd' in body
      if (!hasCreate && !hasUpdate) return fail(130010001, 'time range required')
      const s = body['updateAtStart'] as number
      const e = body['updateAtEnd'] as number
      const group = body['afterSalesStatusGroup']
      const rows = (data.refunds ?? []).filter(
        (r) =>
          (group === undefined || r['afterSalesStatusGroup'] === group) &&
          (r['updateAt'] as number) >= s &&
          (r['updateAt'] as number) <= e,
      )
      return ok({ total: rows.length, pageNumber: page, data: slice(rows, page, size) })
    }
    if (type === 'bg.local.goods.detail.query')
      return ok({ goodsId: body['goodsId'], goodsName: 'Wireless Headphones', goodsDesc: 'desc' })
    if (type === 'bg.order.detail.v2.get')
      return ok({
        parentOrderMap: { parentOrderSn: body['parentOrderSn'], parentOrderStatus: 2 },
        orderList: [],
      })
    return fail(3000000, 'unhandled')
  })
  return { post, calls }
}

function fake(data: Data = {}) {
  const server = makeServer(data)
  vi.spyOn(axios, 'create').mockReturnValue({ post: server.post, defaults: {} } as never)
  return server
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')
const goods = (prefix: number, n: number, status: number): Raw[] =>
  Array.from({ length: n }, (_, i) => ({
    goodsId: prefix * 10000 + i,
    goodsName: `G ${prefix}-${pad(i)}`,
    status4VO: status,
  }))
const orders = (n: number, updateTime = 1_705_574_400): Raw[] =>
  Array.from({ length: n }, (_, i) => ({
    parentOrderMap: { parentOrderSn: `PO-${pad(i)}`, updateTime },
    orderList: [],
  }))
const refunds = (n: number, updateAt: number, group = 5): Raw[] =>
  Array.from({ length: n }, (_, i) => ({
    parentAfterSalesSn: `PAS-${group}-${pad(i)}`,
    parentOrderSn: `PO-${pad(i)}`,
    afterSalesStatusGroup: group,
    updateAt,
  }))

async function walk(
  run: (p: QueryParams) => Promise<{ id: string }[]>,
  L: number,
  extra: Partial<QueryParams> = {},
) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L, ...extra } as QueryParams)
    seen.push(...(await run(params)).map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Temu client', () => {
  it('signs as the documented worked example does (sign 4CCF219942D4180C6DDA3CE36C1B838F)', () => {
    const params = {
      access_token: '2nifvmpyymvypwmcms5ct4uqqudrwgpmzbcnmkt1jzjkuaf3x56iixym',
      app_key: 'f9d5cc9313893a20d5aa85c654e8f503',
      data_type: 'JSON',
      sendRequestList: [
        {
          orderSendInfoList: [
            {
              quantity: 1,
              orderSn: '211-21905473070712792',
              parentOrderSn: 'PO-211-21905452099192792',
              goodsId: 601099548666279,
              skuId: 17592352673534,
            },
          ],
          carrierId: '699272611',
          trackingNumber: '270324232756',
        },
      ],
      sendType: 0,
      timestamp: 1711009072,
      type: 'bg.logistics.shipment.confirm',
    }
    expect(computeSign(params, SECRET)).toBe('4CCF219942D4180C6DDA3CE36C1B838F')
  })

  it('sends a 10-digit seconds timestamp, data_type JSON, and no version', async () => {
    const { calls } = fake({ orders: orders(1) })
    await new TemuAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(String(calls[0]!['timestamp'])).toMatch(/^\d{10}$/)
    expect(calls[0]!['data_type']).toBe('JSON')
    expect('version' in calls[0]!).toBe(false)
    expect(calls[0]!['app_key']).toBe('f9d5cc9313893a20d5aa85c654e8f503')
    expect(calls[0]!['access_token']).toBe('tok-1')
  })

  it('reads the documented envelope: success false throws with errorCode and errorMsg', async () => {
    const post = vi.fn(async () => ({
      data: { success: false, errorCode: 140020013, errorMsg: 'x not passed in' },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ post, defaults: {} } as never)
    await expect(
      new TemuAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toThrow(/140020013.*x not passed in/)
  })

  it('treats a response without success: true as a failure, not an empty page', async () => {
    const post = vi.fn(async () => ({ data: { result: { totalItemNum: 0, pageItems: [] } } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post, defaults: {} } as never)
    await expect(
      new TemuAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toBeInstanceOf(TemuApiError)
  })
})

describe('listProducts (bg.local.goods.list.query, status buckets 1, 4, 5)', () => {
  it('serves 2L+1 rows once each across uneven buckets, with exact hasMore', async () => {
    for (const [L, sizes] of [
      [3, [4, 0, 3]],
      [60, [105, 10, 6]],
    ] as const) {
      _resetRowPager()
      vi.restoreAllMocks()
      const data: Data = {
        goods: {
          1: goods(1, sizes[0], 1),
          4: goods(4, sizes[1], 4),
          5: goods(5, sizes[2], 5),
          6: goods(6, 3, 6),
        },
      }
      const ids = [...data.goods![1]!, ...data.goods![4]!, ...data.goods![5]!].map((g) =>
        String(g['goodsId']),
      )
      expect(ids).toHaveLength(2 * L + 1)
      fake(data)
      const a = new TemuAdapter()
      const { seen, hasMore } = await walk((p) => a.listProducts(CREDS, p), L)
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('sends pageNo, pageSize 100 and one goodsStatusFilterType per upstream request, never deleted (6)', async () => {
    const { calls } = fake({ goods: { 1: goods(1, 101, 1), 5: goods(5, 2, 5), 6: goods(6, 2, 6) } })
    const rows = await new TemuAdapter().listProducts(
      CREDS,
      withPageSink({ page: 1, limit: 100 } as QueryParams),
    )
    expect(rows).toHaveLength(100)
    await new TemuAdapter().listProducts(
      CREDS,
      withPageSink({ page: 2, limit: 100 } as QueryParams),
    )
    expect(calls.map((c) => [c['goodsStatusFilterType'], c['pageNo'], c['pageSize']])).toEqual([
      [1, 1, 100],
      [1, 2, 100],
      [4, 1, 100],
      [5, 1, 100],
    ])
    expect(calls.every((c) => !('page_no' in c) && !('update_time_start' in c))).toBe(true)
  })

  it('ends a bucket on result.total, never asking for the page after a full last page', async () => {
    const { calls } = fake({
      goods: { 1: goods(1, 100, 1), 4: goods(4, 200, 4), 5: goods(5, 1, 5) },
    })
    const rows = await new TemuAdapter().listProducts(
      CREDS,
      withPageSink({ page: 1, limit: 500 } as QueryParams),
    )
    expect(rows).toHaveLength(301)
    expect(calls.map((c) => [c['goodsStatusFilterType'], c['pageNo']])).toEqual([
      [1, 1],
      [4, 1],
      [4, 2],
      [5, 1],
    ])
  })
})

describe('listOrders (bg.order.list.v2.get)', () => {
  it('serves 2L+1 rows once each with exact hasMore from totalItemNum', async () => {
    for (const L of [3, 17]) {
      vi.restoreAllMocks()
      const data = { orders: orders(2 * L + 1) }
      fake(data)
      const { seen, hasMore } = await walk((p) => new TemuAdapter().listOrders(CREDS, p), L)
      expect(seen).toEqual(data.orders.map((o) => (o['parentOrderMap'] as Raw)['parentOrderSn']))
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('sends the caller page as pageNumber and limit as pageSize, reporting totalItemNum', async () => {
    const { calls } = fake({ orders: orders(20) })
    const params = withPageSink({ page: 2, limit: 7 } as QueryParams)
    await new TemuAdapter().listOrders(CREDS, params)
    expect(calls[0]).toMatchObject({ type: 'bg.order.list.v2.get', pageNumber: 2, pageSize: 7 })
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 20, hasMore: true })
  })

  it('clamps a limit above 100 to the documented max and reports the size sent', async () => {
    const { calls } = fake({ orders: orders(150) })
    const params = withPageSink({ page: 1, limit: 150 } as QueryParams)
    expect(await new TemuAdapter().listOrders(CREDS, params)).toHaveLength(100)
    expect(calls[0]!['pageSize']).toBe(100)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })

  it('sends updatedAfter as updateAtStart with updateAtEnd, both in seconds', async () => {
    const { calls } = fake({ orders: [...orders(2, 1_600_000_000), ...orders(3)] })
    const since = new Date('2024-01-01T00:00:00Z')
    const rows = await new TemuAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: since } as QueryParams),
    )
    expect(rows).toHaveLength(3)
    expect(calls[0]!['updateAtStart']).toBe(1_704_067_200)
    expect(String(calls[0]!['updateAtEnd'])).toMatch(/^\d{10}$/)
  })
})

describe('listRefunds (bg.aftersales.parentaftersales.list.get, group 5)', () => {
  it('refuses an unfiltered call with 501 before any request: a time range is required', async () => {
    const { post } = fake({ refunds: refunds(3, 1_705_574_400) })
    await expect(
      new TemuAdapter().listRefunds(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams)),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(post).not.toHaveBeenCalled()
  })

  it('walks 2L+1 refunded rows since updatedAfter once each, with exact hasMore', async () => {
    for (const L of [3, 17]) {
      vi.restoreAllMocks()
      const wanted = refunds(2 * L + 1, 1_705_574_400)
      fake({ refunds: [...wanted, ...refunds(4, 1_705_574_400, 6), ...refunds(2, 1_600_000_000)] })
      const since = new Date('2024-01-01T00:00:00Z')
      const { seen, hasMore } = await walk((p) => new TemuAdapter().listRefunds(CREDS, p), L, {
        updatedAfter: since,
      })
      expect(seen).toEqual(wanted.map((r) => r['parentAfterSalesSn']))
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('sends pageNo, pageSize, afterSalesStatusGroup 5 and updateAtStart/updateAtEnd in seconds', async () => {
    const { calls } = fake({ refunds: refunds(3, 1_705_574_400) })
    await new TemuAdapter().listRefunds(
      CREDS,
      withPageSink({
        page: 2,
        limit: 2,
        updatedAfter: new Date('2024-01-01T00:00:00Z'),
      } as QueryParams),
    )
    expect(calls[0]).toMatchObject({
      type: 'bg.aftersales.parentaftersales.list.get',
      pageNo: 2,
      pageSize: 2,
      afterSalesStatusGroup: 5,
      updateAtStart: 1_704_067_200,
    })
    expect(String(calls[0]!['updateAtEnd'])).toMatch(/^\d{10}$/)
  })
})

describe('listRefunds page size', () => {
  it('sends a limit up to the documented max of 200 unclamped', async () => {
    const { calls } = fake({ refunds: refunds(250, 1_705_574_400) })
    const params = withPageSink({
      page: 1,
      limit: 150,
      updatedAfter: new Date('2024-01-01T00:00:00Z'),
    } as QueryParams)
    expect(await new TemuAdapter().listRefunds(CREDS, params)).toHaveLength(150)
    expect(calls[0]!['pageSize']).toBe(150)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('get methods', () => {
  it('getProduct calls bg.local.goods.detail.query with a numeric goodsId', async () => {
    const { calls } = fake()
    const p = await new TemuAdapter().getProduct(CREDS, '601099548666279')
    expect(calls[0]).toMatchObject({
      type: 'bg.local.goods.detail.query',
      goodsId: 601099548666279,
    })
    expect(p.id).toBe('601099548666279')
  })

  it('getProduct rejects a non-numeric id without a request', async () => {
    const { post } = fake()
    await expect(new TemuAdapter().getProduct(CREDS, 'abc')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(post).not.toHaveBeenCalled()
  })

  it('getOrder calls bg.order.detail.v2.get with parentOrderSn', async () => {
    const { calls } = fake()
    const o = await new TemuAdapter().getOrder(CREDS, 'PO-211-1')
    expect(calls[0]).toMatchObject({ type: 'bg.order.detail.v2.get', parentOrderSn: 'PO-211-1' })
    expect(o.id).toBe('PO-211-1')
  })
})

describe('refused methods: 501 NOT_SUPPORTED and no request', () => {
  const a = new TemuAdapter()
  const p = { page: 1, limit: 5 } as QueryParams
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['listVariants', () => a.listVariants(CREDS, p)],
    ['getVariant', () => a.getVariant(CREDS, '1')],
    ['listInventoryLevels', () => a.listInventoryLevels(CREDS, p)],
    ['getInventoryLevel', () => a.getInventoryLevel(CREDS, '1:x')],
    ['listFulfillments', () => a.listFulfillments(CREDS, p)],
    ['getFulfillment', () => a.getFulfillment(CREDS, '1')],
    ['getRefund', () => a.getRefund(CREDS, 'PAS-1')],
  ]
  for (const [name, run] of cases) {
    it(name, async () => {
      const { post } = fake()
      await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(post).not.toHaveBeenCalled()
    })
  }
})
