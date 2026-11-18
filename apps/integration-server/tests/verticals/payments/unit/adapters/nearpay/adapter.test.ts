/**
 * NearPay adapter: host, auth header, request shapes, paging and refusals.
 *
 * Documented (first-party):
 * - Accounts API production base, Postman environment linked from
 *   https://docs.nearpay.io/sa/en/api-endpoints/accounts-api:
 *   "base_url": "https://api.nearpay.io/v1/clients-sdk".
 * - Header: "The API key must be included in every request as an api-key
 *   header." (banks-api page); every request in the Accounts Postman
 *   collection carries {"key":"api-key","value":"{{api-key}}"}.
 * - GET /transactions answers {"transactions": [...], "pages": {"total", "current"}};
 *   GET /transactions/{transaction_id} answers {"transaction": {...}}.
 * - Paging (support.nearpay.io/apis-and-sdk, "How to use Pagination?"):
 *   `page` "Defines which page you want to access", `limit` "Defines how many
 *   objects you want to list per page", default "30 objects per one page",
 *   `pages.total` = "number of pages", `pages.current` = "Current page of the response".
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { NearpayAdapter } from '../../../../../../src/verticals/payments/adapters/nearpay/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'

const CREDS: Credentials = { accessToken: 'np_test_key' }
const DEFAULT_LIMIT = 30

function txn(id: string, type = 'purchase'): Record<string, unknown> {
  return {
    id,
    created_at: '2023-09-28T08:54:49.563Z',
    receipts: [
      {
        id: `r-${id}`,
        type,
        amount_authorized: { label: { english: 'PURCHASE AMOUNT' }, value: '10.00' },
        currency: { arabic: '', english: 'SAR' },
        is_approved: true,
        is_refunded: false,
        is_reversed: false,
        transaction_uuid: id,
        created_at: '2023-09-28T08:54:49.647Z',
        updated_at: '2023-09-28T08:54:49.647Z',
      },
    ],
    customer_reference_number: null,
  }
}

function makeIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `txn-${String(i + 1).padStart(5, '0')}`)
}

interface Sent {
  path: string
  params: Record<string, unknown>
}

/**
 * A fake NearPay honouring only the documented `page` and `limit` query
 * parameters on GET /transactions; anything else is a 400. Any other path is
 * a route-level 404, as the live host answers for /customers and /refunds.
 */
function fakeNearpay(
  n: number,
  opts: { refunds?: Set<string>; respond?: (path: string) => unknown } = {},
) {
  const all = makeIds(n)
  const row = (id: string) => txn(id, opts.refunds?.has(id) ? 'refund' : 'purchase')
  const sent: Sent[] = []
  const created: Array<Record<string, unknown>> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    sent.push({ path, params })
    if (opts.respond) return { data: opts.respond(path) }
    if (path.startsWith('/transactions/')) {
      const id = decodeURIComponent(path.slice('/transactions/'.length))
      if (!all.includes(id)) {
        throw Object.assign(new Error('404'), { response: { status: 404 } })
      }
      return { data: { transaction: row(id) } }
    }
    if (path !== '/transactions') {
      throw Object.assign(new Error(`Cannot GET ${path}`), { response: { status: 404 } })
    }
    for (const k of Object.keys(params)) {
      if (k !== 'page' && k !== 'limit') {
        throw Object.assign(new Error(`400 ${k}`), { response: { status: 400 } })
      }
    }
    const limit = params.limit === undefined ? DEFAULT_LIMIT : Number(params.limit)
    const page = params.page === undefined ? 1 : Number(params.page)
    const rows = all.slice((page - 1) * limit, page * limit).map(row)
    return {
      data: { transactions: rows, pages: { total: Math.ceil(all.length / limit), current: page } },
    }
  })
  const post = vi.fn(async () => {
    throw new Error('unexpected POST')
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Record<string, unknown>) => {
    created.push(cfg)
    return { get, post, delete: vi.fn() }
  }) as never)
  return { all, sent, created, get, post }
}

async function callPage(adapter: NearpayAdapter, page: number, limit: number) {
  const params = withPageSink({ page, limit })
  const items = await adapter.listCharges(CREDS, params)
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, items }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NearPay client', () => {
  it('targets the documented production Accounts API host with an api-key header', async () => {
    const { created } = fakeNearpay(1)
    await new NearpayAdapter().listCharges(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(created).toHaveLength(1)
    expect(created[0]!.baseURL).toBe('https://api.nearpay.io/v1/clients-sdk')
    const headers = created[0]!.headers as Record<string, string>
    expect(headers['api-key']).toBe('np_test_key')
    expect(headers.Authorization).toBeUndefined()
  })

  it('stores the submitted API key as the credential', async () => {
    const creds = await new NearpayAdapter().exchangeCredentials({ apiKey: ' k1 ' })
    expect(creds).toEqual({ accessToken: 'k1' })
    await expect(new NearpayAdapter().exchangeCredentials({})).rejects.toThrow(/API key/)
  })
})

describe('NearPay listCharges', () => {
  it('sends GET /transactions with the caller page and limit only', async () => {
    const { sent } = fakeNearpay(10)
    await callPage(new NearpayAdapter(), 2, 4)
    expect(sent).toEqual([{ path: '/transactions', params: { page: 2, limit: 4 } }])
  })

  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    const { all } = fakeNearpay(2 * L + 1)
    const adapter = new NearpayAdapter()
    const p1 = await callPage(adapter, 1, L)
    const p2 = await callPage(adapter, 2, L)
    const p3 = await callPage(adapter, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(all)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
  })

  it('reports hasMore false on an exactly full last page', async () => {
    const L = 3
    const { all } = fakeNearpay(2 * L)
    const adapter = new NearpayAdapter()
    const p1 = await callPage(adapter, 1, L)
    const p2 = await callPage(adapter, 2, L)
    expect([...p1.ids, ...p2.ids]).toEqual(all)
    expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
  })

  it('maps rows to schema-valid charges', async () => {
    fakeNearpay(2)
    const { items } = await callPage(new NearpayAdapter(), 1, 5)
    for (const c of items) ChargeSchema.parse(c)
    expect(items[0]!.amount).toBe(1000)
    expect(items[0]!.currency).toBe('SAR')
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeNearpay(5)
    const adapter = new NearpayAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      const items: unknown[] = await adapter.listCharges(CREDS, params)
      return listPage(items, params, 'nearpay')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('NearPay listCharges refund-type rows', () => {
  it('drops refund-type transactions and keeps paging exact over the upstream pages', async () => {
    const L = 3
    const refunds = new Set(['txn-00002', 'txn-00006'])
    const { all } = fakeNearpay(2 * L + 1, { refunds })
    const adapter = new NearpayAdapter()
    const p1 = await callPage(adapter, 1, L)
    const p2 = await callPage(adapter, 2, L)
    const p3 = await callPage(adapter, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(all.filter((id) => !refunds.has(id)))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    for (const c of [...p1.items, ...p2.items, ...p3.items]) expect(c.status).toBe('succeeded')
  })
})

describe('NearPay listCharges envelope', () => {
  it('reports the platform pages.total and pages.current', async () => {
    fakeNearpay(7)
    const params = withPageSink({ page: 2, limit: 3 })
    await new NearpayAdapter().listCharges(CREDS, params)
    expect(readUpstreamPage(params)).toMatchObject({ totalPages: 3, currentPage: 2, hasMore: true })
  })

  it('throws, rather than reading an empty last page, when transactions is missing', async () => {
    fakeNearpay(0, { respond: () => ({ pages: { total: 1, current: 1 } }) })
    await expect(
      new NearpayAdapter().listCharges(CREDS, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/transactions array/)
  })
})

describe('NearPay getCharge', () => {
  it('percent-encodes the id into the path', async () => {
    const { sent } = fakeNearpay(1)
    await expect(new NearpayAdapter().getCharge(CREDS, 'a/b')).rejects.toThrow()
    expect(sent[0]!.path).toBe('/transactions/a%2Fb')
  })

  it('throws when the answer has no transaction envelope', async () => {
    fakeNearpay(0, { respond: () => ({}) })
    await expect(new NearpayAdapter().getCharge(CREDS, 'x')).rejects.toThrow(/no transaction/)
  })

  it('answers 404 for a refund-type transaction', async () => {
    const { all } = fakeNearpay(2, { refunds: new Set(['txn-00001']) })
    await expect(new NearpayAdapter().getCharge(CREDS, all[0]!)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('reads GET /transactions/{transaction_id} and its transaction envelope', async () => {
    const { sent, all } = fakeNearpay(3)
    const c = await new NearpayAdapter().getCharge(CREDS, all[1]!)
    expect(sent).toEqual([{ path: `/transactions/${all[1]}`, params: {} }])
    expect(ChargeSchema.parse(c).id).toBe(all[1])
  })
})

describe('NearPay refusals', () => {
  it.each([
    [
      'listCustomers',
      (a: NearpayAdapter) => a.listCustomers(CREDS, withPageSink({ page: 1, limit: 5 })),
    ],
    ['getCustomer', (a: NearpayAdapter) => a.getCustomer(CREDS, 'x')],
    [
      'listRefunds',
      (a: NearpayAdapter) => a.listRefunds(CREDS, withPageSink({ page: 1, limit: 5 })),
    ],
  ] as const)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const { get, post, created } = fakeNearpay(3)
    await expect(call(new NearpayAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
  })
})
