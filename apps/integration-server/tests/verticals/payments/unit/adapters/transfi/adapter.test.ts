/**
 * TransFi list/get methods against a fake that honours only documented
 * parameters and headers.
 *
 * - Auth: "TransFi uses HTTP Basic Authentication" —
 *   https://docs.transfi.com/docs/authenticating-on-the-api.md
 * - Host: "Production: https://api.transfi.com" and "List endpoints support
 *   `limit` (default 10, max 100) and `page` (from 1)." —
 *   https://docs.transfi.com/docs/api-concepts.md
 * - GET /v3/orders (MID header required; page, limit ≤ 100, orderType, …),
 *   rows in `data.transfers[]`, end signal `pagination.hasNext` —
 *   https://docs.transfi.com/reference/list-orders.md
 * - GET /v3/orders/{orderId} — https://docs.transfi.com/reference/get-order.md
 * - GET /v3/users/individual and /v3/users/business (MID required; page,
 *   limit ≤ 100, userId exact match), rows in `data[]` —
 *   https://docs.transfi.com/reference/list-individual-users.md,
 *   https://docs.transfi.com/reference/list-business-users.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const createMock = vi.fn((_config: unknown) => ({ get: getMock, post: postMock }))
  return { getMock, postMock, createMock }
})

vi.mock('axios', () => ({ default: { create: createMock } }))

import { TransfiAdapter } from '../../../../../../src/verticals/payments/adapters/transfi'

const adapter = new TransfiAdapter()
const CREDS: Credentials = {
  accessToken: 'pw-secret',
  extra: { username: 'merchant-user', mid: 'SABCDEF_SCT8YW_NA' },
}
const MAX = 100

const ORDER_PARAMS = new Set([
  'page',
  'limit',
  'status',
  'orderType',
  'fromDate',
  'toDate',
  'userId',
  'currency',
])
const USER_PARAMS = new Set([
  'page',
  'limit',
  'userId',
  'email',
  'phone',
  'accountType',
  'accountIdentifierValue',
  'accountIdentifierType',
])

type Call = { path: string; params: Record<string, unknown> }

function checkLimit(params: Record<string, unknown>): number {
  if (params['limit'] === undefined) return 10
  const limit = Number(params['limit'])
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
    throw new Error(`VALIDATION_ERROR limit ${String(params['limit'])}`)
  return limit
}

function checkPage(params: Record<string, unknown>): number {
  if (params['page'] === undefined) return 1
  const page = Number(params['page'])
  if (!Number.isInteger(page) || page < 1) throw new Error('VALIDATION_ERROR page')
  return page
}

function pagination(total: number, page: number, limit: number) {
  const pages = Math.ceil(total / limit)
  return { total, pages, currentPage: page, limit, hasNext: page < pages, hasPrev: page > 1 }
}

function orderRow(id: string, orderType: string) {
  return {
    id,
    status: 'fund_settled',
    orderType,
    source: { currency: 'USD', amount: '10' },
    destination: { currency: 'EUR', amount: '9' },
    userId: 'UX-1',
    createdAt: '2026-03-07T10:56:21.899Z',
  }
}

/** Serve `counts[type]` orders of each type, honouring only documented params. */
function serveOrders(counts: Record<string, number>): Call[] {
  const calls: Call[] = []
  getMock.mockImplementation(
    async (path: string, cfg: { params?: Record<string, unknown> } = {}) => {
      const params = cfg.params ?? {}
      calls.push({ path, params: { ...params } })
      if (path !== '/v3/orders') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params))
        if (!ORDER_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
      const limit = checkLimit(params)
      const page = checkPage(params)
      const type = String(params['orderType'] ?? '')
      const n = counts[type] ?? 0
      const all = Array.from({ length: n }, (_, i) => orderRow(`OR-${type}-${i + 1}`, type))
      return {
        data: {
          status: 'success',
          data: { transfers: all.slice((page - 1) * limit, page * limit) },
          pagination: pagination(n, page, limit),
        },
      }
    },
  )
  return calls
}

function userRow(kind: string, i: number) {
  return kind === 'individual'
    ? {
        userId: `UX-ind-${i}`,
        type: 'individual',
        firstName: 'A',
        lastName: `${i}`,
        email: `a${i}@example.com`,
      }
    : {
        userId: `UX-biz-${i}`,
        type: 'business',
        businessName: `Biz ${i}`,
        email: `b${i}@example.com`,
      }
}

/** Serve `ind` individual and `biz` business users, honouring only documented params. */
function serveUsers(ind: number, biz: number): Call[] {
  const calls: Call[] = []
  getMock.mockImplementation(
    async (path: string, cfg: { params?: Record<string, unknown> } = {}) => {
      const params = cfg.params ?? {}
      calls.push({ path, params: { ...params } })
      const kind =
        path === '/v3/users/individual'
          ? 'individual'
          : path === '/v3/users/business'
            ? 'business'
            : null
      if (!kind) throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params))
        if (!USER_PARAMS.has(k)) throw new Error(`undocumented param ${k}`)
      const limit = params['limit'] === undefined ? 5 : checkLimit(params)
      const page = checkPage(params)
      const n = kind === 'individual' ? ind : biz
      let all = Array.from({ length: n }, (_, i) => userRow(kind, i + 1))
      if (params['userId'] !== undefined) all = all.filter((u) => u.userId === params['userId'])
      return {
        data: {
          status: 'success',
          data: all.slice((page - 1) * limit, page * limit),
          pagination: pagination(all.length, page, limit),
        },
      }
    },
  )
  return calls
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  createMock.mockClear()
  _resetCursorPager()
})

describe('TransfiAdapter client', () => {
  it('sends Basic auth and the MID header to the production host', async () => {
    serveOrders({ payin: 1 })
    await adapter.listCharges(CREDS, { page: 1, limit: 10 })
    const cfg = createMock.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.transfi.com')
    expect(cfg.headers['Authorization']).toBe(
      `Basic ${Buffer.from('merchant-user:pw-secret').toString('base64')}`,
    )
    expect(cfg.headers['MID']).toBe('SABCDEF_SCT8YW_NA')
  })

  it('refuses with 501 and sends nothing when the connection has no MID', async () => {
    serveOrders({ payin: 1 })
    const creds: Credentials = { accessToken: 'pw', extra: { username: 'u' } }
    await expect(adapter.listCharges(creds, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(adapter.listCustomers(creds, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('refuses a connection made with the old single API key before sending anything', async () => {
    serveOrders({ payin: 1 })
    await expect(
      adapter.listPayouts({ accessToken: 'old-api-key' }, { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(getMock).not.toHaveBeenCalled()
  })

  it('exchangeCredentials keeps username and MID and requires all three fields', async () => {
    await expect(
      adapter.exchangeCredentials({ username: 'u', password: 'p', mid: 'M1' }),
    ).resolves.toEqual({ accessToken: 'p', extra: { username: 'u', mid: 'M1' } })
    await expect(adapter.exchangeCredentials({ username: 'u', password: 'p' })).rejects.toThrow(
      /MID/,
    )
  })
})

describe.each([
  ['listCharges', 'payin'],
  ['listPayouts', 'payout'],
] as const)('TransfiAdapter.%s', (method, orderType) => {
  const call = (params: Parameters<TransfiAdapter['listCharges']>[1]) =>
    (adapter[method] as TransfiAdapter['listCharges']).call(adapter, CREDS, params)

  it('walks 2L+1 orders across three pages, each once, hasMore exact', async () => {
    const L = 10
    const calls = serveOrders({ [orderType]: 2 * L + 1, other: 5 })
    const ids: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await call(params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `OR-${orderType}-${i + 1}`))
    expect(new Set(ids).size).toBe(ids.length)
    expect(more).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { orderType, page: 1, limit: L },
      { orderType, page: 2, limit: L },
      { orderType, page: 3, limit: L },
    ])
  })

  it('reports total from pagination', async () => {
    serveOrders({ [orderType]: 25 })
    const params = withPageSink({ page: 1, limit: 10 })
    await call(params)
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 25,
      totalPages: 3,
      currentPage: 1,
    })
  })

  it('clamps a limit above 100 and reports the size it sent', async () => {
    const calls = serveOrders({ [orderType]: 150 })
    const params = withPageSink({ page: 1, limit: 250 })
    const rows = await call(params)
    expect(rows).toHaveLength(100)
    expect(calls[0]!.params['limit']).toBe(100)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })
})

describe('TransfiAdapter get order', () => {
  function serveOne(data: Record<string, unknown>) {
    const calls: string[] = []
    getMock.mockImplementation(async (path: string) => {
      calls.push(path)
      return { data: { status: 'success', data } }
    })
    return calls
  }

  it('getCharge reads GET /v3/orders/{orderId}', async () => {
    const calls = serveOne({
      id: 'OR-2604090808229261005',
      status: 'fund_settled',
      type: 'payin',
      source: { currency: 'USD', amount: '100' },
      destination: { currency: 'USD', amount: '79.7' },
    })
    const c = await adapter.getCharge(CREDS, 'OR-2604090808229261005')
    expect(calls).toEqual(['/v3/orders/OR-2604090808229261005'])
    expect(c.amount).toBe(10000)
  })

  it('getPayout reads GET /v3/orders/{orderId}', async () => {
    serveOne({
      id: 'OR-2509301734555691983',
      status: 'fund_processing',
      type: 'payout',
      source: { currency: 'USDT', amount: '12.481217' },
      destination: { currency: 'EUR', amount: '10' },
    })
    const p = await adapter.getPayout(CREDS, 'OR-2509301734555691983')
    expect(p.amount).toBe(1000)
    expect(p.currency).toBe('EUR')
  })

  it('getCharge on a response with no order is a 404, not a 500', async () => {
    getMock.mockImplementation(async () => ({ data: { status: 'success' } }))
    await expect(adapter.getCharge(CREDS, 'OR-missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('getCharge on a payout order is a 404', async () => {
    serveOne({ id: 'OR-1', type: 'payout', destination: { currency: 'EUR', amount: '10' } })
    await expect(adapter.getCharge(CREDS, 'OR-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('TransfiAdapter.listCustomers', () => {
  it('walks individual then business users, 2L+1 with an uneven upstream page, each id once', async () => {
    const L = 10
    // 13 individuals + 8 businesses = 21 = 2L+1; the individual collection ends mid-page.
    const calls = serveUsers(13, 8)
    const ids: string[] = []
    const more: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await adapter.listCustomers(CREDS, params)).map((c) => c.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual([
      ...Array.from({ length: 13 }, (_, i) => `UX-ind-${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `UX-biz-${i + 1}`),
    ])
    expect(new Set(ids).size).toBe(21)
    expect(more).toEqual([true, true, false])
    for (const c of calls) expect(c.params['limit']).toBe(MAX)
    expect(calls.some((c) => c.path === '/v3/users/business')).toBe(true)
  })

  it('pages each collection past 100 rows by page number', async () => {
    const calls = serveUsers(150, 0)
    const out: string[] = []
    for (let page = 1; page <= 2; page++) {
      out.push(
        ...(await adapter.listCustomers(CREDS, withPageSink({ page, limit: 100 }))).map(
          (c) => c.id,
        ),
      )
    }
    expect(out).toHaveLength(150)
    expect(new Set(out).size).toBe(150)
    expect(
      calls.filter((c) => c.path === '/v3/users/individual').map((c) => c.params['page']),
    ).toEqual([1, 2])
  })

  it('getCustomer finds a business user by the documented userId filter', async () => {
    const calls = serveUsers(3, 3)
    const c = await adapter.getCustomer(CREDS, 'UX-biz-2')
    expect(c.id).toBe('UX-biz-2')
    expect(c.name).toBe('Biz 2')
    expect(calls.map((x) => [x.path, x.params])).toEqual([
      ['/v3/users/individual', { userId: 'UX-biz-2' }],
      ['/v3/users/business', { userId: 'UX-biz-2' }],
    ])
  })

  it('getCustomer on an unknown id is a 404', async () => {
    serveUsers(1, 1)
    await expect(adapter.getCustomer(CREDS, 'UX-nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('TransfiAdapter.listRefunds', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.listRefunds(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
  })
})
