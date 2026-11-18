/**
 * JD.com list paging: what each list method sends through the JOS gateway,
 * driven through the real adapter with the router's own `parseListQuery` and
 * the sync worker's `withPageSink({ page, limit })`.
 *
 * jingdong.asc.serviceAndRefund.view (JOS API id 15040), from
 * https://jos.jd.com/apilist?apiGroupId=241&apiId=15040&apiName=jingdong.asc.serviceAndRefund.view
 * (served as JSON at https://joshome.jd.com/api/detail?id=15040&apiName=jingdong.asc.serviceAndRefund.view):
 *   pageNumber     "页码(从1开始)"        → 1-based page number
 *   pageSize       "每页大小（1-50，默认10）" → 1..50, default 10
 *   applyTimeBegin "申请开始时间（和申请结束时间均不能为空，且开始时间与结束时间的时间差不能超过7天）"
 *                  → begin and end at most 7 days apart; error 10310
 *                  "服务单查询申请时间间隔不得大于7天" otherwise
 *   pageResult.totalCount "总数" → the total the adapter derives hasMore from
 * The official SDK example sets pageNumber/pageSize flat on the request
 * (`setPageNumber`, `setPageSize`), which is how the adapter sends them in
 * 360buy_param_json. appKey, venderId and pin are `SystemValue: true` — filled
 * by the gateway, not sent by the caller.
 *
 * Refused before any request (501 NOT_SUPPORTED): listProducts
 * (jingdong.sku.list), listInventoryLevels (jingdong.sku.list, then
 * jingdong.stock.read), listOrders (jingdong.order.search) and listDiscounts
 * (jingdong.seller.promotion.v2.list). None of those four method names is in
 * the JOS API catalogue — the 3,435 APIs that
 * https://joshome.jd.com/api/list?id=<group> lists across the 87 groups of
 * https://joshome.jd.com/api/index, which do include
 * jingdong.asc.serviceAndRefund.view — so they have no documented request, let
 * alone documented paging. The catalogue's current SKU, order and stock lists
 * (jingdong.sku.read.searchSkuList, jingdong.pop.order.search,
 * jingdong.ware.stock.sku.query) take different parameters and are not wired.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  parseListQuery,
  withPageSink,
  readUpstreamPage,
  listPage,
  type QueryParams,
} from '@opensteward/shared'
import { JdAdapter } from '../../../../../../src/verticals/ecommerce/adapters/jdcom/index'

const CREDS = { accessToken: 'tok', extra: { appKey: 'app-key', appSecret: 'app-secret' } }

const DAY_MS = 24 * 60 * 60 * 1000

interface Call {
  method: string
  biz: Record<string, unknown>
}

/** "YYYY-MM-DD HH:mm:ss" as sent by the adapter, read as UTC. */
function joshTime(value: unknown): number {
  const t = Date.parse(String(value).replace(' ', 'T') + 'Z')
  if (Number.isNaN(t)) throw new Error(`fake jos: unparseable time ${String(value)}`)
  return t
}

/**
 * A JOS gateway that honours ONLY the documented parameters of
 * jingdong.asc.serviceAndRefund.view, including its 7-day apply-time window.
 * Rows are ids 1..total, in order.
 */
function fakeJos(total: number) {
  const calls: Call[] = []
  const ids = Array.from({ length: total }, (_, i) => i + 1)
  const post = vi.fn(async (_url: string, body: string) => {
    const form = new URLSearchParams(body)
    const method = form.get('method') ?? ''
    const biz = JSON.parse(form.get('360buy_param_json') ?? '{}') as Record<string, unknown>
    calls.push({ method, biz })
    if (method !== 'jingdong.asc.serviceAndRefund.view')
      throw new Error(`fake jos: unexpected ${method}`)
    if (biz['applyTimeBegin'] !== undefined || biz['applyTimeEnd'] !== undefined) {
      const begin = joshTime(biz['applyTimeBegin'])
      const end = joshTime(biz['applyTimeEnd'])
      if (begin > end) {
        return {
          data: {
            error_response: { code: '10300', zh_desc: '服务单查询申请开始时间不得大于结束时间' },
          },
        }
      }
      if (end - begin > 7 * DAY_MS) {
        return {
          data: { error_response: { code: '10310', zh_desc: '服务单查询申请时间间隔不得大于7天' } },
        }
      }
    }
    const pageNumber = biz['pageNumber'] === undefined ? 1 : Number(biz['pageNumber'])
    const pageSize = biz['pageSize'] === undefined ? 10 : Number(biz['pageSize'])
    if (!Number.isInteger(pageNumber) || pageNumber < 1)
      throw new Error(`fake jos: pageNumber ${String(biz['pageNumber'])}`)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new Error(`fake jos: pageSize ${String(biz['pageSize'])} outside 1-50`)
    }
    const start = (pageNumber - 1) * pageSize
    return {
      data: {
        jingdong_asc_serviceAndRefund_view_responce: {
          pageResult: {
            success: 'true',
            pageNumber: String(pageNumber),
            pageSize: String(pageSize),
            totalCount: String(total),
            data: ids.slice(start, start + pageSize).map((id) => ({ afsRefundId: String(id) })),
          },
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post, get: vi.fn() } as never)
  return calls
}

interface Method {
  name: string
  jdMethod: string
  /** Documented pageSize ceiling. */
  max: number
  run: (adapter: JdAdapter, params: QueryParams) => Promise<string[]>
}

const METHODS: Method[] = [
  {
    name: 'listRefunds',
    jdMethod: 'jingdong.asc.serviceAndRefund.view',
    max: 50,
    run: async (a, p) => (await a.listRefunds(CREDS, p)).map((r) => r.id),
  },
]

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

function listCall(calls: Call[], jdMethod: string): Call {
  const call = calls.find((c) => c.method === jdMethod)
  if (!call) throw new Error(`no ${jdMethod} in ${JSON.stringify(calls.map((c) => c.method))}`)
  return call
}

afterEach(() => vi.restoreAllMocks())

describe('JdAdapter list paging', () => {
  it('declares the documented pageSize ceiling of jingdong.asc.serviceAndRefund.view', () => {
    expect(new JdAdapter().capabilities?.maxPageSize).toBe(50)
  })

  it.each(METHODS)('$name: page 1 asks for the first rows', async (m) => {
    const calls = fakeJos(35)
    const ids = await m.run(new JdAdapter(), parseListQuery({ page: '1', limit: '10' }))
    expect(ids).toEqual(range(1, 10))
    expect(listCall(calls, m.jdMethod).biz).toMatchObject({ pageNumber: 1, pageSize: 10 })
  })

  it.each(METHODS)('$name: page 2 asks for the next rows', async (m) => {
    const calls = fakeJos(35)
    const ids = await m.run(new JdAdapter(), parseListQuery({ page: '2', limit: '10' }))
    expect(ids).toEqual(range(11, 20))
    expect(listCall(calls, m.jdMethod).biz).toMatchObject({ pageNumber: 2, pageSize: 10 })
  })

  it.each(METHODS)('$name: a missing page is the first page', async (m) => {
    const calls = fakeJos(35)
    const ids = await m.run(new JdAdapter(), parseListQuery({ limit: '10' }))
    expect(ids).toEqual(range(1, 10))
    expect(listCall(calls, m.jdMethod).biz).toMatchObject({ pageNumber: 1, pageSize: 10 })
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each(METHODS)('$name: a direct page 0 or -3 is the first page', async (m) => {
    for (const page of [0, -3]) {
      const calls = fakeJos(35)
      const params = parseListQuery({ limit: '10' })
      params.page = page
      const ids = await m.run(new JdAdapter(), params)
      expect(ids).toEqual(range(1, 10))
      expect(listCall(calls, m.jdMethod).biz).toMatchObject({ pageNumber: 1, pageSize: 10 })
      vi.restoreAllMocks()
    }
  })

  it.each(METHODS)(
    '$name: a limit above the documented max is clamped, and page 2 strides by the clamp',
    async (m) => {
      const calls = fakeJos(3 * m.max + 1)
      const ids = await m.run(new JdAdapter(), parseListQuery({ page: '2', limit: '500' }))
      expect(ids).toEqual(range(m.max + 1, 2 * m.max))
      expect(listCall(calls, m.jdMethod).biz).toMatchObject({ pageNumber: 2, pageSize: m.max })
    },
  )

  it('listRefunds with no limit at all sends pageSize 50 (the default, which is also the documented max)', async () => {
    // DEFAULT_PAGE_SIZE and the documented max are both 50, so `?? 50` and
    // `?? <anything ≥ 50>` send the same request: no test can tell them apart.
    const calls = fakeJos(60)
    const ids = await new JdAdapter().listRefunds(CREDS, {})
    expect(ids.map((r) => r.id)).toEqual(range(1, 50))
    expect(listCall(calls, 'jingdong.asc.serviceAndRefund.view').biz).toMatchObject({
      pageNumber: 1,
      pageSize: 50,
    })
  })

  it.each(METHODS)(
    '$name: reports whether rows remain past this page, from pageResult.totalCount',
    async (m) => {
      fakeJos(35)
      const first = parseListQuery({ page: '1', limit: '10' })
      await m.run(new JdAdapter(), first)
      expect(readUpstreamPage(first)?.hasMore).toBe(true)

      vi.restoreAllMocks()
      fakeJos(35)
      const last = parseListQuery({ page: '4', limit: '10' })
      expect(await m.run(new JdAdapter(), last)).toEqual(range(31, 35))
      expect(readUpstreamPage(last)?.hasMore).toBe(false)

      // A collection that is an exact multiple of the page: the full last page
      // still says there is no more.
      vi.restoreAllMocks()
      fakeJos(30)
      const exact = parseListQuery({ page: '3', limit: '10' })
      expect(await m.run(new JdAdapter(), exact)).toEqual(range(21, 30))
      expect(readUpstreamPage(exact)?.hasMore).toBe(false)
    },
  )

  it.each(METHODS)(
    "$name: the router's default page (limit 100, clamped to 50) does not claim the end of the list",
    async (m) => {
      // 80 rows: more than the 50 sent, fewer than the 100 the router asked
      // for, so a total measured against the router's limit would say "no more".
      fakeJos(80)
      const params = parseListQuery({})
      const ids = await m.run(new JdAdapter(), params)
      expect(ids).toEqual(range(1, 50))
      // Without a report, 50 < 100 reads as a short last page.
      expect(listPage(ids, params, 'jdcom').meta.hasMore).toBe(true)
    },
  )

  it.each(METHODS)(
    '$name: a sync-style walk returns every row exactly once, in order',
    async (m) => {
      const adapter = new JdAdapter()
      // The sync worker's page size: min(500, capabilities.maxPageSize), and its
      // stop rule: the reported hasMore when given, else a short page.
      const limit = Math.min(500, adapter.capabilities?.maxPageSize ?? 500)
      const total = 2 * limit + 1
      fakeJos(total)
      const seen: string[] = []
      for (let page = 1; page <= 10; page++) {
        const params = withPageSink({ page, limit })
        const rows = await m.run(adapter, params)
        seen.push(...rows)
        const reported = readUpstreamPage(params)?.hasMore
        if (typeof reported === 'boolean' ? !reported : rows.length < limit) break
      }
      expect(seen).toEqual(range(1, total))
    },
  )
})

describe('JdAdapter listRefunds apply-time window', () => {
  it('with no updated_after, asks for a window inside the documented 7 days', async () => {
    const calls = fakeJos(5)
    expect(await new JdAdapter().listRefunds(CREDS, parseListQuery({}))).toHaveLength(5)
    const { applyTimeBegin, applyTimeEnd } = listCall(
      calls,
      'jingdong.asc.serviceAndRefund.view',
    ).biz
    const span = joshTime(applyTimeEnd) - joshTime(applyTimeBegin)
    expect(span).toBeLessThanOrEqual(7 * DAY_MS)
    // The widest window that fits: today and the six days before it, whole days.
    expect(span).toBe(7 * DAY_MS - 1000)
  })

  it('an updated_after inside the window is sent as the window start', async () => {
    const calls = fakeJos(5)
    const since = new Date(Date.now() - 3 * DAY_MS)
    await new JdAdapter().listRefunds(CREDS, { updatedAfter: since })
    expect(listCall(calls, 'jingdong.asc.serviceAndRefund.view').biz['applyTimeBegin']).toBe(
      since.toISOString().substring(0, 10) + ' 00:00:00',
    )
  })
})

describe.each([
  ['listProducts', 'jingdong.sku.list'],
  ['listInventoryLevels', 'jingdong.sku.list'],
  ['listOrders', 'jingdong.order.search'],
  ['listDiscounts', 'jingdong.seller.promotion.v2.list'],
] as const)('JdAdapter %s', (name, jdMethod) => {
  it.each([{}, { page: '2', limit: '10' }])(
    'refuses with 501 NOT_SUPPORTED, naming the retired method, and sends nothing (query %o)',
    async (q) => {
      const calls = fakeJos(100)
      const adapter = new JdAdapter()
      const list = adapter[name].bind(adapter) as (c: typeof CREDS, p: QueryParams) => Promise<unknown>
      await expect(list(CREDS, parseListQuery(q))).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringContaining(jdMethod),
      })
      expect(calls).toEqual([])
    },
  )

  it('cites the JOS catalogue it was checked against, not the developer portal', async () => {
    fakeJos(100)
    const adapter = new JdAdapter()
    const list = adapter[name].bind(adapter) as (c: typeof CREDS, p: QueryParams) => Promise<unknown>
    const err = (await list(CREDS, parseListQuery({})).catch((e: unknown) => e)) as Error
    expect(err.message).toContain('https://joshome.jd.com/api/index')
    expect(err.message).not.toContain('https://jos.jd.com/')
  })
})
