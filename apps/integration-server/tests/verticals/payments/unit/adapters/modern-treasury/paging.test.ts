/**
 * Modern Treasury list paging: every cursor-paged list serves the caller's
 * page `page` at `limit`.
 *
 * https://docs.moderntreasury.com/platform/reference/pagination.md:
 *   "You may use the query params `after_cursor` and `per_page` to control the
 *    number of results you see. For `per_page` the default will be 25 but can
 *    optionally be increased to a maximum of 100."
 *   X-After-Cursor: "The next cursor value to retrieve more results. When there
 *    are no more pages of results to retrieve, this header will be missing."
 *   "We make a best effort to respect the `X-Per-Page` parameter, the actual
 *    number of records returned may be less than, equal to, or more than the
 *    requested amount. You may also receive blank pages while paginating."
 *
 * The responses are bare JSON arrays. The adapter used to send `per_page` and
 * never `after_cursor`, so page 2 of every list was page 1 again.
 *
 * GET /api/payment_orders also takes the documented `direction` filter
 * (https://docs.moderntreasury.com/platform/reference/list-payment-orders.md);
 * listCharges must send `direction=debit`, and the fake refuses anything else.
 *
 * Auth: "-u ORGANIZATION_ID:API_KEY", HTTP basic with username = Organization
 * ID and password = API key
 * (https://docs.moderntreasury.com/platform/reference/authentication.md).
 *
 * The fake upstream below honours ONLY `per_page` and `after_cursor`, answers
 * at the seam every Modern Treasury request crosses (axios's transport), puts
 * the next cursor in the X-After-Cursor header only, and rejects a per_page
 * above the documented 100. Its `ragged` mode exercises the best-effort
 * clause: page sizes that ignore per_page, and blank pages mid-chain.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ModernTreasuryAdapter } from '../../../../../../src/verticals/payments/adapters/modern-treasury/index'

const ORIGIN = 'https://app.moderntreasury.com'
const DOCUMENTED = new Set(['per_page', 'after_cursor'])
const DOCUMENTED_FILTERS: Record<string, Set<string>> = {
  '/api/payment_orders': new Set(['direction']),
}

const adapter = new ModernTreasuryAdapter()
const CREDS_A = { accessToken: 'TEST_KEY_A', extra: { organizationId: 'org' } }
const CREDS_B = { accessToken: 'TEST_KEY_B', extra: { organizationId: 'org' } }

interface Seen {
  url: URL
  user: string
  token: string
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { message } } })
}

let seen: Seen[] = []
const realAdapter = axios.defaults.adapter

/**
 * `counts[path]` rows per token. Ids carry the token so a row served to the
 * wrong connection shows. Cursors are opaque (base64 of the next offset and
 * the per_page it was minted under).
 */
function fakeMT(
  counts: Record<string, number>,
  opts: { ragged?: boolean; blankEndCursor?: boolean } = {},
): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const auth = String(config.headers?.get?.('Authorization') ?? config.headers?.['Authorization'])
    if (!auth.startsWith('Basic ')) throw httpError(401, 'basic auth required')
    const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8')
    const colon = decoded.indexOf(':')
    const user = decoded.slice(0, colon)
    const token = decoded.slice(colon + 1)
    seen.push({ url, user, token })
    if (colon < 1 || token === '') throw httpError(401, 'bad credentials')
    if (url.origin !== ORIGIN) throw httpError(404, `no such host ${url.origin}`)
    const n = counts[url.pathname]
    if (n === undefined) throw httpError(404, `no route ${url.pathname}`)
    for (const k of url.searchParams.keys())
      if (!DOCUMENTED.has(k) && !DOCUMENTED_FILTERS[url.pathname]?.has(k))
        throw httpError(400, `unknown parameter ${k}`)
    if (url.pathname === '/api/payment_orders' && url.searchParams.get('direction') !== 'debit')
      throw httpError(400, 'this fake serves only direction=debit')
    const q = url.searchParams
    const perPage = q.has('per_page') ? Number(q.get('per_page')) : 25
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100)
      throw httpError(422, 'per_page must be between 1 and 100')
    let first = 0
    let page = 0
    const cur = q.get('after_cursor')
    if (cur === '') throw httpError(422, 'after_cursor must not be blank')
    if (cur !== null) {
      const decoded = JSON.parse(Buffer.from(cur, 'base64').toString('utf8')) as {
        o: number
        p: number
        n: number
      }
      if (decoded.p !== perPage) throw httpError(422, 'cursor minted under another per_page')
      first = decoded.o
      page = decoded.n
    }
    // Best effort: in ragged mode every third page is blank, others vary.
    let size = perPage
    if (opts.ragged)
      size = page % 3 === 1 ? 0 : page % 3 === 2 ? perPage + 3 : Math.max(1, perPage - 2)
    const all = idsFor(url.pathname, n, token)
    const rows = all.slice(first, first + size).map((id) => rowFor(url.pathname, id))
    const end = first + size
    const headers: Record<string, string> = { 'x-per-page': String(perPage) }
    if (end < n)
      headers['x-after-cursor'] = Buffer.from(
        JSON.stringify({ o: end, p: perPage, n: page + 1 }),
      ).toString('base64')
    else if (opts.blankEndCursor) headers['x-after-cursor'] = ''
    return { data: rows, status: 200, statusText: 'OK', headers, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

/** A row carrying the documented fields its transform reads. */
function rowFor(path: string, id: string): Record<string, unknown> {
  if (path === '/api/payment_orders')
    return {
      id,
      object: 'payment_order',
      amount: 1000,
      currency: 'USD',
      direction: 'debit',
      status: 'completed',
      counterparty_id: null,
      metadata: {},
    }
  if (path === '/api/counterparties')
    return { id, object: 'counterparty', name: null, email: null, metadata: {} }
  return { id, object: 'x' }
}

function idsFor(path: string, n: number, token = CREDS_A.accessToken): string[] {
  const tag = path.replace(/^\/api\//, '').replaceAll('/', '.')
  return Array.from({ length: n }, (_, i) => `${token}:${tag}:${String(i + 1).padStart(4, '0')}`)
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method =
  | 'listPaymentMethods'
  | 'listInvoices'
  | 'listInvoiceLineItems'
  | 'listBalanceTransactions'
  | 'listCustomers'
  | 'listCharges'

const INVOICE = 'inv_1'

async function call(
  method: Method,
  creds: typeof CREDS_A,
  params: QueryParams,
): Promise<{ id: string }[]> {
  if (method === 'listInvoiceLineItems') return adapter.listInvoiceLineItems(creds, INVOICE, params)
  return adapter[method](creds, params)
}

async function syncPage(
  method: Method,
  page: number,
  limit: number,
  creds = CREDS_A,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params: QueryParams = withPageSink({ page, limit })
  const rows = await call(method, creds, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

async function walk(method: Method, limit: number): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 200; page++) {
    const { ids, hasMore } = await syncPage(method, page, limit)
    out.push(...ids)
    if (hasMore === false || (hasMore === undefined && ids.length < limit)) return out
  }
  throw new Error('walk did not end')
}

const METHODS = [
  ['listPaymentMethods', '/api/external_accounts'],
  ['listInvoices', '/api/invoices'],
  ['listInvoiceLineItems', `/api/invoices/${INVOICE}/invoice_line_items`],
  ['listBalanceTransactions', '/api/transactions'],
  ['listCustomers', '/api/counterparties'],
  ['listCharges', '/api/payment_orders'],
] as const

describe.each(METHODS)('modern-treasury %s pages by after_cursor', (method, path) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once and in order, hasMore exact', async () => {
    fakeMT({ [path]: 2 * L + 1 })
    const all = idsFor(path, 2 * L + 1)
    expect(await syncPage(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    expect(await syncPage(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
  })

  it('reports hasMore false when the rows end exactly on a page', async () => {
    fakeMT({ [path]: 2 * L })
    const all = idsFor(path, 2 * L)
    await syncPage(method, 1, L)
    expect(await syncPage(method, 2, L)).toEqual({ ids: all.slice(L), hasMore: false })
  })

  it('sends the documented after_cursor (from X-After-Cursor) on page 2', async () => {
    fakeMT({ [path]: 2 * L + 1 })
    await syncPage(method, 2, L)
    for (const s of seen) expect(s.url.pathname).toBe(path)
    const page2 = seen.find((s) => s.url.searchParams.has('after_cursor'))
    expect(page2).toBeDefined()
    expect(page2!.url.searchParams.get('per_page')).toBe(String(L))
  })

  it('clamps a limit above the documented maximum of 100 and serves every row', async () => {
    fakeMT({ [path]: 257 })
    const all = idsFor(path, 257)
    expect(await syncPage(method, 1, 200)).toEqual({ ids: all.slice(0, 200), hasMore: true })
    expect(await syncPage(method, 2, 200)).toEqual({ ids: all.slice(200), hasMore: false })
    for (const s of seen)
      expect(Number(s.url.searchParams.get('per_page'))).toBeLessThanOrEqual(100)
  })

  it('serves every row at the sync worker page size', async () => {
    fakeMT({ [path]: 1_203 })
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
    expect(await walk(method, 500)).toEqual(idsFor(path, 1_203))
  })

  it('serves exact caller pages when upstream page sizes are best-effort and pages are blank', async () => {
    fakeMT({ [path]: 47 }, { ragged: true })
    expect(await walk(method, 7)).toEqual(idsFor(path, 47))
  })

  it('keeps each connection on its own walk', async () => {
    fakeMT({ [path]: 2 * L + 1 })
    await syncPage(method, 1, L, CREDS_A)
    const b2 = await syncPage(method, 2, L, CREDS_B)
    expect(b2.ids).toEqual(idsFor(path, 2 * L + 1, CREDS_B.accessToken).slice(L, 2 * L))
  })

  it('gives meta.hasMore through parseListQuery then listPage', async () => {
    fakeMT({ [path]: 25 })
    const params2 = parseListQuery({ limit: '10', page: '2' })
    const env2 = listPage(await call(method, CREDS_A, params2), params2, 'modern-treasury')
    expect(env2.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(10, 20))
    expect(env2.meta.hasMore).toBe(true)
    const params3 = parseListQuery({ limit: '10', page: '3' })
    const env3 = listPage(await call(method, CREDS_A, params3), params3, 'modern-treasury')
    expect(env3.data.map((r) => r.id)).toEqual(idsFor(path, 25).slice(20))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('modern-treasury list walks are keyed per collection and per parent', () => {
  it('keeps line items of two invoices on separate walks', async () => {
    const other = '/api/invoices/inv_2/invoice_line_items'
    const mine = `/api/invoices/${INVOICE}/invoice_line_items`
    fakeMT({ [mine]: 25, [other]: 25 })
    await adapter.listInvoiceLineItems(CREDS_A, 'inv_2', withPageSink({ page: 1, limit: 10 }))
    const p2 = await syncPage('listInvoiceLineItems', 2, 10)
    expect(p2).toEqual({ ids: idsFor(mine, 25).slice(10, 20), hasMore: true })
  })

  it('keeps invoices and transactions on separate walks on one connection', async () => {
    fakeMT({ '/api/invoices': 25, '/api/transactions': 25 })
    await syncPage('listInvoices', 1, 10)
    const p2 = await syncPage('listBalanceTransactions', 2, 10)
    expect(p2).toEqual({ ids: idsFor('/api/transactions', 25).slice(10, 20), hasMore: true })
  })
})

describe('modern-treasury paging edge cases', () => {
  it('keeps walks at different limits apart on one collection and connection', async () => {
    const path = '/api/invoices'
    fakeMT({ [path]: 40 })
    const all = idsFor(path, 40)
    await syncPage('listInvoices', 1, 10)
    await syncPage('listInvoices', 2, 10)
    expect(await syncPage('listInvoices', 2, 7)).toEqual({ ids: all.slice(7, 14), hasMore: true })
    expect(await syncPage('listInvoices', 3, 10)).toEqual({ ids: all.slice(20, 30), hasMore: true })
  })

  it('serves the default page of 50 at per_page 50 when no limit is given', async () => {
    const path = '/api/invoices'
    fakeMT({ [path]: 120 })
    const params: QueryParams = withPageSink({ page: 1 })
    const rows = await adapter.listInvoices(CREDS_A, params)
    expect(rows.map((r) => r.id)).toEqual(idsFor(path, 120).slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    for (const s of seen) expect(s.url.searchParams.get('per_page')).toBe('50')
  })

  it('treats a blank X-After-Cursor header as the end of the chain', async () => {
    const path = '/api/transactions'
    fakeMT({ [path]: 15 }, { blankEndCursor: true })
    const all = idsFor(path, 15)
    expect(await syncPage('listBalanceTransactions', 1, 10)).toEqual({
      ids: all.slice(0, 10),
      hasMore: true,
    })
    expect(await syncPage('listBalanceTransactions', 2, 10)).toEqual({
      ids: all.slice(10),
      hasMore: false,
    })
    for (const s of seen) expect(s.url.searchParams.get('after_cursor')).not.toBe('')
  })
})

describe('modern-treasury customers, charges and refunds', () => {
  it('lists customers from GET /api/counterparties, never the fabricated /customers', async () => {
    fakeMT({ '/api/counterparties': 3 })
    const rows = await adapter.listCustomers(CREDS_A, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(idsFor('/api/counterparties', 3))
    expect(seen.map((s) => s.url.pathname)).toEqual(['/api/counterparties'])
  })

  it('lists charges from GET /api/payment_orders with direction=debit', async () => {
    fakeMT({ '/api/payment_orders': 3 })
    const rows = await adapter.listCharges(CREDS_A, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(idsFor('/api/payment_orders', 3))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url.pathname).toBe('/api/payment_orders')
    expect(seen[0]!.url.searchParams.get('direction')).toBe('debit')
  })

  it('listRefunds refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    fakeMT({})
    await expect(
      adapter.listRefunds(CREDS_A, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(seen).toHaveLength(0)
  })

  it('reads one customer from GET /api/counterparties/{id} (a bare object)', async () => {
    seen = []
    axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const url = new URL(axios.getUri(config))
      seen.push({ url, user: '', token: '' })
      if (url.pathname !== '/api/counterparties/cp_1') throw httpError(404, 'no route')
      return {
        data: { id: 'cp_1', object: 'counterparty', name: 'Acme', email: null, metadata: {} },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
      }
    }) as unknown as AxiosAdapter
    const c = await adapter.getCustomer(CREDS_A, 'cp_1')
    expect(c).toMatchObject({ id: 'cp_1', name: 'Acme' })
  })

  function serveOrder(direction: 'credit' | 'debit'): void {
    seen = []
    axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const url = new URL(axios.getUri(config))
      seen.push({ url, user: '', token: '' })
      if (url.pathname !== '/api/payment_orders/po_1') throw httpError(404, 'no route')
      return {
        data: {
          id: 'po_1',
          object: 'payment_order',
          amount: 2500,
          currency: 'EUR',
          direction,
          status: 'pending',
          counterparty_id: 'cp_1',
          metadata: {},
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
      }
    }) as unknown as AxiosAdapter
  }

  it('reads one charge from GET /api/payment_orders/{id}', async () => {
    serveOrder('debit')
    const c = await adapter.getCharge(CREDS_A, 'po_1')
    expect(c).toMatchObject({ id: 'po_1', amount: 2500, currency: 'EUR', customerId: 'cp_1' })
  })

  it('does not serve a credit payment order as a charge', async () => {
    serveOrder('credit')
    await expect(adapter.getCharge(CREDS_A, 'po_1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('modern-treasury auth', () => {
  it('sends HTTP basic with the Organization ID as username and the API key as password', async () => {
    fakeMT({ '/api/invoices': 1 })
    await adapter.listInvoices(CREDS_A, withPageSink({ page: 1, limit: 10 }))
    expect(seen[0]).toMatchObject({ user: 'org', token: 'TEST_KEY_A' })
  })

  it('collects the Organization ID and the API key at connect time', async () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['organizationId', true],
      ['apiKey', true],
    ])
    await expect(
      adapter.exchangeCredentials({ organizationId: 'org_1', apiKey: 'k' }),
    ).resolves.toEqual({ accessToken: 'k', extra: { organizationId: 'org_1' } })
    await expect(adapter.exchangeCredentials({ apiKey: 'k' })).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('refuses a connection saved without an Organization ID before sending anything', async () => {
    fakeMT({ '/api/invoices': 1 })
    await expect(
      adapter.listInvoices(
        { accessToken: 'k', extra: { organizationId: '' } },
        withPageSink({ page: 1, limit: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 401, code: 'CREDENTIALS_INCOMPLETE' })
    expect(seen).toHaveLength(0)
  })
})
