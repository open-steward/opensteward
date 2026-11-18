/**
 * Amazon SP-API (logistics) orders: getOrders / getOrder.
 *
 * The fake honours ONLY what ordersV0.json documents
 * (github.com/amzn/selling-partner-api-models, models/orders-api-model):
 *   - `MarketplaceIds` is `required: true` (csv array);
 *   - "Either the `CreatedAfter` parameter or the `LastUpdatedAfter`
 *     parameter is required. Both cannot be empty.";
 *   - `MaxResultsPerPage`: "Value must be 1 - 100. Default 100.";
 *   - `NextToken`: "A string token returned in the response of your previous
 *     request.";
 *   - the response is `{ payload: { Orders, NextToken } }` and getOrder's is
 *     `{ payload: Order }`.
 * Anything else makes the fake answer 400, as Amazon would.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import { AmazonSpApiAdapter } from '../../../../../../src/verticals/logistics/adapters/amazon-sp-api/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = {
  accessToken: 'tok',
  refreshToken: 'rt',
  extra: { marketplaceIds: ['ATVPDKIKX0DER', 'A2EUQ1WTGCTBG2'] },
}
const DOCUMENTED = new Set([
  'MarketplaceIds',
  'CreatedAfter',
  'LastUpdatedAfter',
  'MaxResultsPerPage',
  'NextToken',
])

interface Call {
  path: string
  params?: Record<string, unknown>
}

function badRequest(msg: string): never {
  throw Object.assign(new Error(msg), { response: { status: 400 } })
}

function order(id: string) {
  return {
    AmazonOrderId: id,
    PurchaseDate: '2017-01-20T19:49:35Z',
    LastUpdateDate: '2017-01-20T19:49:35Z',
    OrderStatus: 'Shipped',
    OrderTotal: { CurrencyCode: 'USD', Amount: '11.01' },
  }
}

function ordersFake(total: number, opts: { emptyEnd?: boolean } = {}) {
  const ids = Array.from(
    { length: total },
    (_, i) => `902-0000000-${String(i + 1).padStart(7, '0')}`,
  )
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (path.startsWith('orders/v0/orders/')) {
      const id = decodeURIComponent(path.slice('orders/v0/orders/'.length))
      return { data: { payload: order(id) } }
    }
    if (path !== 'orders/v0/orders') throw new Error(path)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && !DOCUMENTED.has(k)) badRequest(`undocumented ${k}`)
    }
    if (!params['MarketplaceIds']) badRequest('MarketplaceIds required')
    if (!params['CreatedAfter'] && !params['LastUpdatedAfter']) badRequest('date required')
    const size =
      params['MaxResultsPerPage'] === undefined ? 100 : Number(params['MaxResultsPerPage'])
    if (!(size >= 1 && size <= 100)) badRequest('MaxResultsPerPage must be 1 - 100')
    const token = params['NextToken'] as string | undefined
    const start = token ? Number(token.replace('nt-', '')) : 0
    const end = Math.min(start + size, ids.length)
    return {
      data: {
        payload: {
          Orders: ids.slice(start, end).map(order),
          // "When present and not empty": an empty token is also an end.
          ...(end < ids.length
            ? { NextToken: `nt-${end}` }
            : opts.emptyEnd
              ? { NextToken: '' }
              : {}),
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { calls, ids }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const L = 3
const N = 2 * L + 1

describe('listOrders: getOrders', () => {
  it('pages 1..3 of 2L+1 rows return every id once, in order, with hasMore exact', async () => {
    const { ids } = ordersFake(N)
    const adapter = new AmazonSpApiAdapter()
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listOrders(CREDS, params)
      rows.forEach((r) => OrderSchema.parse(r))
      seen.push(...rows.map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids)
    expect(more).toEqual([true, true, false])
  })

  it('reads Orders and NextToken from under payload', async () => {
    ordersFake(N)
    const rows = await new AmazonSpApiAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: L }),
    )
    expect(rows).toHaveLength(L)
  })

  it('sends the connection marketplaces, the caller size and the documented floor unfiltered', async () => {
    const { calls } = ordersFake(N)
    await new AmazonSpApiAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: L }))
    expect(calls[0]?.params).toEqual({
      MarketplaceIds: 'ATVPDKIKX0DER,A2EUQ1WTGCTBG2',
      LastUpdatedAfter: '2016-01-01T00:00:00.000Z',
      MaxResultsPerPage: L,
      NextToken: undefined,
    })
  })

  it('sends params.updatedAfter as LastUpdatedAfter', async () => {
    const { calls } = ordersFake(N)
    const updatedAfter = new Date('2026-09-01T12:00:00Z')
    await new AmazonSpApiAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: L, updatedAfter }),
    )
    expect(calls[0]?.params?.['LastUpdatedAfter']).toBe('2026-09-01T12:00:00.000Z')
  })

  it('the page-2 request carries NextToken with the same filters', async () => {
    const { calls } = ordersFake(N)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: L }))
    await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(2)
    expect(calls[1]?.params).toMatchObject({
      NextToken: `nt-${L}`,
      MaxResultsPerPage: L,
      MarketplaceIds: 'ATVPDKIKX0DER,A2EUQ1WTGCTBG2',
    })
  })

  it('a cold page 2 walks from page 1', async () => {
    const { calls, ids } = ordersFake(N)
    const rows = await new AmazonSpApiAdapter().listOrders(
      CREDS,
      withPageSink({ page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(calls).toHaveLength(2)
  })

  it('clamps the size to 100 and reports the size it sent', async () => {
    const { calls } = ordersFake(250)
    const params = withPageSink({ page: 1, limit: 150 })
    const rows = await new AmazonSpApiAdapter().listOrders(CREDS, params)
    expect(calls[0]?.params?.['MaxResultsPerPage']).toBe(100)
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pageSize: 100 })
  })

  it('refuses with 501 and sends nothing when the connection has no marketplaces', async () => {
    const { calls } = ordersFake(N)
    const err = await new AmazonSpApiAdapter()
      .listOrders({ accessToken: 'tok' }, withPageSink({ page: 1, limit: L }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/MarketplaceIds/)
    expect(calls).toHaveLength(0)
  })

  it('API path: parseListQuery → listOrders → listPage reports hasMore', async () => {
    ordersFake(N)
    const adapter = new AmazonSpApiAdapter()
    const params = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(await adapter.listOrders(CREDS, params), params, 'amazon-sp-api')
    expect(env.data).toHaveLength(1)
    expect(env.meta.hasMore).toBe(false)
  })
})

describe('listOrders: edges', () => {
  it('an empty NextToken ends the collection', async () => {
    ordersFake(N, { emptyEnd: true })
    const adapter = new AmazonSpApiAdapter()
    const more: (boolean | undefined)[] = []
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listOrders(CREDS, params)).map((r) => r.id as string))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toHaveLength(N)
    expect(more).toEqual([true, true, false])
  })

  it('an explicit cursor is sent as NextToken, in one request', async () => {
    const { calls, ids } = ordersFake(N)
    const params = withPageSink({ page: 1, limit: L, cursor: `nt-${L}` })
    const rows = await new AmazonSpApiAdapter().listOrders(CREDS, params)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.params).toMatchObject({ NextToken: `nt-${L}`, MaxResultsPerPage: L })
    expect(rows.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reads a csv-string extra.marketplaceIds', async () => {
    const { calls } = ordersFake(N)
    await new AmazonSpApiAdapter().listOrders(
      { ...CREDS, extra: { marketplaceIds: ' ATVPDKIKX0DER , A2EUQ1WTGCTBG2 ' } },
      withPageSink({ page: 1, limit: L }),
    )
    expect(calls[0]?.params?.['MarketplaceIds']).toBe('ATVPDKIKX0DER,A2EUQ1WTGCTBG2')
  })
})

describe('listOrders: one NextToken chain per filter set', () => {
  // Page 2 after page 1 under a DIFFERENT filter must not reuse page 1's
  // token: NextToken "only impacts the pagination for the filtered orders
  // response", so a cold walk (2 requests, the first without a token) is due.
  async function page2After(
    first: { creds: typeof CREDS; limit: number; updatedAfter?: Date },
    second: { creds: typeof CREDS; limit: number; updatedAfter?: Date },
  ) {
    const { calls } = ordersFake(N)
    const adapter = new AmazonSpApiAdapter()
    await adapter.listOrders(
      first.creds,
      withPageSink({ page: 1, limit: first.limit, updatedAfter: first.updatedAfter }),
    )
    await adapter.listOrders(
      second.creds,
      withPageSink({ page: 2, limit: second.limit, updatedAfter: second.updatedAfter }),
    )
    return calls.slice(1)
  }

  it('a different updatedAfter starts a new chain', async () => {
    const updatedAfter = new Date('2026-09-01T00:00:00Z')
    const later = await page2After(
      { creds: CREDS, limit: L },
      { creds: CREDS, limit: L, updatedAfter },
    )
    expect(later).toHaveLength(2)
    expect(later[0]?.params?.['NextToken']).toBeUndefined()
  })

  it('a different page size starts a new chain', async () => {
    const later = await page2After({ creds: CREDS, limit: L }, { creds: CREDS, limit: L + 1 })
    expect(later).toHaveLength(2)
    expect(later[0]?.params?.['NextToken']).toBeUndefined()
  })

  it('different marketplaces start a new chain', async () => {
    const other = { ...CREDS, extra: { marketplaceIds: ['A2EUQ1WTGCTBG2'] } }
    const later = await page2After({ creds: CREDS, limit: L }, { creds: other, limit: L })
    expect(later).toHaveLength(2)
    expect(later[0]?.params?.['NextToken']).toBeUndefined()
  })
})

describe('getOrder: getOrder', () => {
  it('throws when the response has no payload', async () => {
    const get = vi.fn(async () => ({ data: { errors: [] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(new AmazonSpApiAdapter().getOrder(CREDS, 'x')).rejects.toThrow(/no payload/)
  })

  it('reads the order from payload', async () => {
    const { calls } = ordersFake(1)
    const o = await new AmazonSpApiAdapter().getOrder(CREDS, '902-3159896-1390916')
    expect(calls[0]?.path).toBe('orders/v0/orders/902-3159896-1390916')
    expect(OrderSchema.parse(o).id).toBe('902-3159896-1390916')
    expect(o.status).toBe('SHIPPED')
  })
})
