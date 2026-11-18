/**
 * Orderful listSuppliers and listPurchaseOrders paging, and getSupplier's walk
 * of the relationship list.
 *
 * Both lists are cursor-paginated. Orderful's pagination page
 * (https://docs.orderful.com/reference/pagination):
 *
 *   "The next page of results is indicated using a link with a `nextCursor`
 *    parameter, while any page after the first will also show a link to the
 *    previous paginated set of results using a `prevCursor` parameter."
 *
 * with the example link `"next": "https://{baseUrl}/v3/transactions?nextCursor=Mjk3NDk%3D"`.
 * The link sits at `metadata.pagination.links.next`, null on the last page.
 *
 * GET /v3/relationships (RelationshipController_listV3) documents `autoSend`,
 * `limit` ("The number of items to return in the result set.", maximum 100),
 * `prevCursor` and `nextCursor`.
 *
 * GET /v3/transactions (TransactionControllerV3_list): "A maximum of 100
 * Transactions will be returned at a time." Its query parameters are
 * `prevCursor`, `nextCursor` and filters (`transactionType` among them), and
 * no page size.
 *
 * Before the fix both methods read `params.cursor`, which the paging contract
 * never supplies, so every caller page was page 1 again.
 *
 * The fake below honours ONLY those parameters: anything else is a 400, a
 * `limit` above 100 is a 400, and a cursor it did not mint for this key and
 * this endpoint is a 400. A cursor is a bare row position, as the guide's
 * example cursors are (`Mjk3NDk=` decodes to `29749`): it carries neither the
 * page size nor the transactionType filter it was minted under.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { OrderfulAdapter } from '../../../../../../src/verticals/inventory/adapters/orderful/index'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const KEY_A = 'orderful_key_a'
const KEY_B = 'orderful_key_b'
const CREDS: Credentials = { accessToken: KEY_A }

/** Upstream reads one case may make. A walk that loops fails by name instead of hanging. */
const CALL_BUDGET = 40

/** Largest `limit` GET /v3/relationships accepts. */
const RELATIONSHIPS_MAX = 100
/** "A maximum of 100 Transactions will be returned at a time." */
const TRANSACTIONS_MAX = 100

const DOCUMENTED: Readonly<Record<string, ReadonlySet<string>>> = {
  '/relationships': new Set(['autoSend', 'limit', 'prevCursor', 'nextCursor']),
  '/transactions': new Set([
    'prevCursor',
    'nextCursor',
    'createdAt',
    'stream',
    'businessNumber',
    'transactionType',
    'validationStatus',
    'deliveryStatus',
    'acknowledgmentStatus',
    'senderIsaId',
    'receiverIsaId',
    'referenceIdentifier',
    'senderInterchangeReferenceIdentifier',
    'senderGroupReferenceIdentifier',
    'senderTransactionReferenceIdentifier',
    'receiverInterchangeReferenceIdentifier',
    'receiverGroupReferenceIdentifier',
    'receiverTransactionReferenceIdentifier',
  ]),
}

const PO = '850_PURCHASE_ORDER'

function relIds(start: number, count: number, prefix = 'rel'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(start + i).padStart(5, '0')}`)
}

function poIds(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `po-${String(start + i).padStart(5, '0')}`)
}

interface Account {
  relationships: number
  purchaseOrders: number
  /** Prefix for relationship ids, so two accounts' rows are told apart. */
  relPrefix?: string
}

interface FakeOptions {
  /** The rows each API key sees. */
  accounts?: Record<string, Account>
  /** Rows per /v3/transactions page, at most 100. */
  txnBatch?: number
  /** Hand out a next link to an empty page when a page ends exactly at the last row. */
  nextOnExactEnd?: boolean
}

interface Seen {
  apiKey: string
  path: string
  params: Record<string, unknown>
}

interface Minted {
  apiKey: string
  path: string
  /** Row position the cursor starts at: in the relationship list, or in the whole transaction stream. */
  offset: number
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { response: { status: 400 } })
}

/**
 * A fake Orderful at the axios seam the client uses. Each API key sees its own
 * rows. /v3/transactions holds purchase orders interleaved with other
 * transaction types, and serves only the filtered type when asked.
 */
function fakeOrderful(opts: FakeOptions = {}) {
  const accounts = opts.accounts ?? { [KEY_A]: { relationships: 0, purchaseOrders: 0 } }
  const txnBatch = opts.txnBatch ?? TRANSACTIONS_MAX
  const seen: Seen[] = []
  const minted = new Map<string, Minted>()

  const mint = (m: Minted): string => {
    // Opaque, and needs URL-decoding: '+', '/' and '=' are all percent-encoded in the link.
    const token = `c+${minted.size}/${m.offset}=`
    minted.set(token, m)
    return token
  }
  const link = (path: string, query: Record<string, string | number>): string =>
    `https://api.orderful.com/v3${path}?` +
    Object.entries(query)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

  function relationships(apiKey: string, params: Record<string, unknown>) {
    const account = accounts[apiKey]!
    const limit = params['limit'] === undefined ? 20 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > RELATIONSHIPS_MAX) {
      throw badRequest(
        `limit must be an integer in 1..${RELATIONSHIPS_MAX} (got ${String(params['limit'])})`,
      )
    }
    let offset = 0
    const cursor = params['nextCursor']
    if (cursor !== undefined) {
      const m = minted.get(String(cursor))
      if (!m || m.apiKey !== apiKey || m.path !== '/relationships') {
        throw badRequest(`unknown nextCursor ${String(cursor)}`)
      }
      offset = m.offset
    }
    const all = relIds(1, account.relationships, account.relPrefix)
    const page = all.slice(offset, offset + limit)
    const end = offset + page.length
    const more = end < all.length || (opts.nextOnExactEnd === true && page.length === limit)
    const next = more
      ? link('/relationships', {
          limit,
          nextCursor: mint({ apiKey, path: '/relationships', offset: end }),
        })
      : null
    const prev =
      offset > 0
        ? link('/relationships', {
            limit,
            prevCursor: mint({
              apiKey,
              path: '/relationships',
              offset: Math.max(0, offset - limit),
            }),
          })
        : null
    return {
      metadata: { pagination: { links: { next, prev } } },
      data: page.map((id) => ({
        id,
        status: 'LIVE',
        transactionType: { name: PO },
        receiver: { ediAccountId: 1, organizationName: `Partner ${id}` },
      })),
    }
  }

  function transactions(apiKey: string, params: Record<string, unknown>) {
    const account = accounts[apiKey]!
    const asked = params['transactionType']
    const types =
      asked === undefined ? undefined : Array.isArray(asked) ? asked.map(String) : [String(asked)]
    const wanted = (t: { type: string }): boolean => types === undefined || types.includes(t.type)
    // A cursor is a bare position in the account's whole transaction stream,
    // as the guide's example cursors are ('Mjk3NDk=' decodes to '29749'). It
    // carries no filter: a cursor request without transactionType pages on
    // through every type from there.
    let from = 0
    const cursor = params['nextCursor']
    if (cursor !== undefined) {
      const m = minted.get(String(cursor))
      if (!m || m.apiKey !== apiKey || m.path !== '/transactions') {
        throw badRequest(`unknown nextCursor ${String(cursor)}`)
      }
      from = m.offset
    }
    // Purchase orders, with an acknowledgment after every second one.
    const stream: Array<{ id: string; type: string }> = []
    poIds(1, account.purchaseOrders).forEach((id, i) => {
      stream.push({ id, type: PO })
      if (i % 2 === 1) stream.push({ id: `ack-${i}`, type: '855_PURCHASE_ORDER_ACKNOWLEDGMENT' })
    })
    const page: typeof stream = []
    let end = from
    for (; end < stream.length && page.length < txnBatch; end++) {
      if (wanted(stream[end]!)) page.push(stream[end]!)
    }
    const more =
      stream.slice(end).some(wanted) || (opts.nextOnExactEnd === true && page.length === txnBatch)
    const next = more
      ? link('/transactions', { nextCursor: mint({ apiKey, path: '/transactions', offset: end }) })
      : null
    return {
      metadata: { pagination: { links: { next, prev: null } } },
      data: page.map((t) => ({
        id: t.id,
        type: { name: t.type },
        businessNumber: `BN-${t.id}`,
        deliveryStatus: 'DELIVERED',
      })),
    }
  }

  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const apiKey = String(config?.headers?.['orderful-api-key'] ?? '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      if (seen.length >= CALL_BUDGET) {
        throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
      }
      const params = { ...(cfg?.params ?? {}) }
      seen.push({ apiKey, path, params })
      if (!accounts[apiKey])
        throw Object.assign(new Error('unauthorized'), { response: { status: 401 } })
      const documented = DOCUMENTED[path]
      if (!documented)
        throw Object.assign(new Error(`unexpected GET ${path}`), { response: { status: 404 } })
      const undocumented = Object.keys(params).filter((k) => !documented.has(k))
      if (undocumented.length > 0)
        throw badRequest(`GET ${path} documents no ${undocumented.join(', ')}`)
      return {
        data:
          path === '/relationships' ? relationships(apiKey, params) : transactions(apiKey, params),
      }
    })
    return { get }
  }) as unknown as typeof axios.create)

  return { seen, minted }
}

/**
 * A hand-written Orderful for link shapes the fake never produces: GET number
 * i answers `pages[i]`, whatever it asked for.
 */
function scripted(pages: ReadonlyArray<{ ids: string[]; next: string | null }>) {
  const seen: Array<Record<string, unknown>> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const page = pages[seen.length]
    seen.push({ ...(cfg?.params ?? {}) })
    if (!page) throw new Error(`unscripted GET ${path} (request ${seen.length})`)
    return {
      data: {
        metadata: { pagination: { links: { next: page.next, prev: null } } },
        data: page.ids.map((id) => ({ id })),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
  return { seen }
}

const adapter = () => new OrderfulAdapter({})
/** The adapter as the router holds it, for parseListQuery to read its declared maximum from. */
const routed = (): InventoryAdapter => adapter()

type Method = 'listSuppliers' | 'listPurchaseOrders'

const list = (
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<Array<{ id: string }>> => adapter()[method](creds, params)

const call = async (
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> => (await list(method, params, creds)).map((r) => r.id)

/** Drive a method as the sync worker does: withPageSink({ page, limit }) for pages 1..n. */
async function walk(method: Method, limit: number, pages = 3) {
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sinks: QueryParams[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    served.push(...(await call(method, params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    sinks.push(params)
  }
  return { served, hasMore, sinks }
}

/** The API path: parseListQuery, the adapter, then listPage, for pages 1..n. */
async function apiWalk(method: Method, limit: string, pages = 3) {
  const served: string[] = []
  const metas: Array<{ limit: number; hasMore: boolean | null }> = []
  for (let page = 1; page <= pages; page++) {
    const params = parseListQuery({ page: String(page), limit }, routed())
    const env = listPage(await list(method, params), params, 'orderful')
    served.push(...env.data.map((r) => r.id))
    metas.push({ limit: env.meta.limit, hasMore: env.meta.hasMore })
  }
  return { served, metas }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── listSuppliers: GET /v3/relationships, limit + nextCursor ─────────────────

describe('orderful listSuppliers paging (GET /v3/relationships, limit + nextCursor)', () => {
  const only = (relationships: number, extra: Omit<FakeOptions, 'accounts'> = {}) =>
    fakeOrderful({ ...extra, accounts: { [KEY_A]: { relationships, purchaseOrders: 0 } } })

  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    only(2 * L + 1)
    const { served, hasMore } = await walk('listSuppliers', L)
    expect(served).toEqual(relIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 sends limit=L and the nextCursor from page 1, URL-decoded from links.next', async () => {
    const { seen, minted } = only(9)
    await walk('listSuppliers', 4)
    expect(seen.map((s) => s.path)).toEqual(['/relationships', '/relationships', '/relationships'])
    expect(seen[0]!.params).toEqual({ limit: 4 })
    const firstNext = [...minted.entries()].find(([, m]) => m.offset === 4)![0]
    expect(firstNext).toMatch(/[+/=]/)
    expect(seen[1]!.params).toEqual({ limit: 4, nextCursor: firstNext })
    expect(seen[2]!.params['nextCursor']).toBeDefined()
  })

  it('a sequential walk costs one request per page', async () => {
    const { seen } = only(9)
    await walk('listSuppliers', 4)
    expect(seen).toHaveLength(3)
  })

  it('N = 2L: page 2 is the last, page 3 is empty without a request', async () => {
    const L = 4
    const { seen } = only(2 * L)
    const { served, hasMore } = await walk('listSuppliers', L)
    expect(served).toEqual(relIds(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
    expect(seen).toHaveLength(2)
  })

  it('N = 2L with a next link to an empty page: every row once, hasMore [true, true, false]', async () => {
    const L = 4
    only(2 * L, { nextOnExactEnd: true })
    const { served, hasMore } = await walk('listSuppliers', L)
    expect(served).toEqual(relIds(1, 2 * L))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above 100 sends limit=100, reports pageSize 100, and still serves every row', async () => {
    const { seen } = only(2 * RELATIONSHIPS_MAX + 1)
    const { served, hasMore, sinks } = await walk('listSuppliers', 250)
    expect(served).toEqual(relIds(1, 2 * RELATIONSHIPS_MAX + 1))
    expect(hasMore).toEqual([true, true, false])
    for (const s of seen) expect(s.params['limit']).toBe(RELATIONSHIPS_MAX)
    for (const p of sinks) expect(readUpstreamPage(p)?.pageSize).toBe(RELATIONSHIPS_MAX)
  })

  it('a limit at or under 100 reports no pageSize of its own', async () => {
    only(9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call('listSuppliers', params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    only(15)
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '7' }, routed())
      expect(params.limit).toBe(7)
      served.push(...(await call('listSuppliers', params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(relIds(1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publish an exact meta.hasMore', async () => {
    only(9)
    const { served, metas } = await apiWalk('listSuppliers', '4')
    expect(served).toEqual(relIds(1, 9))
    expect(metas).toEqual([
      { limit: 4, hasMore: true },
      { limit: 4, hasMore: true },
      { limit: 4, hasMore: false },
    ])
  })

  it('API path: limit=500 is served in pages of 100, judged at 100', async () => {
    only(2 * RELATIONSHIPS_MAX + 1)
    const { served, metas } = await apiWalk('listSuppliers', '500')
    expect(served).toEqual(relIds(1, 2 * RELATIONSHIPS_MAX + 1))
    expect(metas).toEqual([
      { limit: 100, hasMore: true },
      { limit: 100, hasMore: true },
      { limit: 100, hasMore: false },
    ])
  })

  it('walks at two page sizes on one connection never trade cursors', async () => {
    // A cursor is a bare position, so one minted at limit 10 starts row 11
    // whatever limit it is sent with. Page 2 at limit 7 starts at row 8.
    const { seen } = only(30)
    expect(await call('listSuppliers', withPageSink({ page: 1, limit: 10 }))).toEqual(relIds(1, 10))
    expect(await call('listSuppliers', withPageSink({ page: 2, limit: 7 }))).toEqual(relIds(8, 7))
    expect(await call('listSuppliers', withPageSink({ page: 2, limit: 10 }))).toEqual(
      relIds(11, 10),
    )
    expect(await call('listSuppliers', withPageSink({ page: 3, limit: 7 }))).toEqual(relIds(15, 7))
    // Limit 7 walked from its own page 1; limit 10's page 2 reused its own cursor.
    expect(seen.map((s) => [s.params['limit'], s.params['nextCursor'] === undefined])).toEqual([
      [10, true],
      [7, true],
      [7, false],
      [10, false],
      [7, false],
    ])
  })

  it('params with no limit get the default page of 100, and a fractional limit is floored', async () => {
    const { seen } = only(2 * RELATIONSHIPS_MAX + 1)
    expect(await call('listSuppliers', { page: 1 })).toEqual(relIds(1, RELATIONSHIPS_MAX))
    expect(seen[0]!.params).toEqual({ limit: RELATIONSHIPS_MAX })
    expect(await call('listSuppliers', { page: 1, limit: 7.9 })).toEqual(relIds(1, 7))
    expect(seen[1]!.params).toEqual({ limit: 7 })
  })

  it("two connections never share cursors: page 2 on another key walks that key's own rows", async () => {
    const { seen } = fakeOrderful({
      accounts: {
        [KEY_A]: { relationships: 9, purchaseOrders: 0, relPrefix: 'a' },
        [KEY_B]: { relationships: 9, purchaseOrders: 0, relPrefix: 'b' },
      },
    })
    expect(await call('listSuppliers', withPageSink({ page: 1, limit: 4 }))).toEqual(
      relIds(1, 4, 'a'),
    )
    const page2 = await call('listSuppliers', withPageSink({ page: 2, limit: 4 }), {
      accessToken: KEY_B,
    })
    expect(page2).toEqual(relIds(5, 4, 'b'))
    // B walked from its own first page; it never sent A's cursor.
    expect(
      seen.filter((s) => s.apiKey === KEY_B).map((s) => s.params['nextCursor'] === undefined),
    ).toEqual([true, false])
  })
})

// ── listPurchaseOrders: GET /v3/transactions, fixed upstream pages ───────────

describe('orderful listPurchaseOrders paging (GET /v3/transactions, nextCursor, no size)', () => {
  const only = (purchaseOrders: number, extra: Omit<FakeOptions, 'accounts'> = {}) =>
    fakeOrderful({ ...extra, accounts: { [KEY_A]: { relationships: 0, purchaseOrders } } })

  it('N = 2L + 1 inside one upstream page of 100: every row once, hasMore [true, true, false]', async () => {
    const L = 4
    only(2 * L + 1)
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('N = 2L + 1 across upstream pages of 3: every row once, hasMore [true, true, false]', async () => {
    const L = 4
    only(2 * L + 1, { txnBatch: 3 })
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('every request filters to 850_PURCHASE_ORDER, sends no size, and page 2 carries the decoded nextCursor', async () => {
    const { seen, minted } = only(9, { txnBatch: 3 })
    await walk('listPurchaseOrders', 4)
    expect(seen.map((s) => s.path).every((p) => p === '/transactions')).toBe(true)
    expect(seen[0]!.params).toEqual({ transactionType: PO })
    // Page 1 has no prev link, so the first cursor minted is its next.
    const firstNext = [...minted.keys()][0]!
    expect(firstNext).toMatch(/[+/=]/)
    expect(seen[1]!.params).toEqual({ transactionType: PO, nextCursor: firstNext })
    for (const s of seen) {
      expect(s.params['transactionType']).toBe(PO)
      expect(s.params).not.toHaveProperty('limit')
    }
  })

  it('a sequential walk costs one request per upstream page', async () => {
    const { seen } = only(9, { txnBatch: 3 })
    await walk('listPurchaseOrders', 4)
    expect(seen).toHaveLength(3)
  })

  it('reports hasMore and pagedLocally itself', async () => {
    only(9, { txnBatch: 3 })
    const params = withPageSink({ page: 1, limit: 4 })
    await call('listPurchaseOrders', params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    only(2 * L, { txnBatch: L })
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('N = 2L with a next link to an empty page: hasMore is still exact', async () => {
    const L = 4
    only(2 * L, { txnBatch: L, nextOnExactEnd: true })
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it("the sync worker's limit of 500 is served whole, five upstream pages to a caller page", async () => {
    // Orderful declares no maxPageSize, so the worker asks for min(500, none) = 500.
    const L = 500
    const { seen } = only(2 * L + 1)
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // 1,001 purchase orders at 100 a page: 11 upstream pages, each fetched once.
    expect(seen).toHaveLength(11)
  })

  it('a limit above the 100-row upstream page is served whole from several upstream pages', async () => {
    const L = 250
    const { seen } = only(2 * L + 1)
    const { served, hasMore } = await walk('listPurchaseOrders', L)
    expect(served).toEqual(poIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // 501 purchase orders plus 250 acknowledgments filtered out upstream: 6 pages of at most 100.
    expect(seen).toHaveLength(6)
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    only(15, { txnBatch: 6 })
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '7' }, routed())
      expect(params.limit).toBe(7)
      served.push(...(await call('listPurchaseOrders', params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(poIds(1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publish an exact meta.hasMore', async () => {
    only(9, { txnBatch: 3 })
    const { served, metas } = await apiWalk('listPurchaseOrders', '4')
    expect(served).toEqual(poIds(1, 9))
    expect(metas).toEqual([
      { limit: 4, hasMore: true },
      { limit: 4, hasMore: true },
      { limit: 4, hasMore: false },
    ])
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    only(8, { txnBatch: 4 })
    const p2 = parseListQuery({ page: '2', limit: '4' }, routed())
    const env2 = listPage(await adapter().listPurchaseOrders(CREDS, p2), p2, 'orderful')
    expect(env2.data.map((r) => r.id)).toEqual(poIds(5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('an empty collection is one empty last page', async () => {
    only(0)
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call('listPurchaseOrders', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it("two connections never share rows: page 2 on another key is that key's own page 2", async () => {
    fakeOrderful({
      txnBatch: 100,
      accounts: {
        [KEY_A]: { relationships: 0, purchaseOrders: 9 },
        [KEY_B]: { relationships: 0, purchaseOrders: 5 },
      },
    })
    await call('listPurchaseOrders', withPageSink({ page: 1, limit: 4 }))
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call('listPurchaseOrders', params, { accessToken: KEY_B })).toEqual(poIds(5, 1))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a pager error names the connection by a fingerprint, never by its API key', async () => {
    // pageByRows puts its key in the errors it throws, and those reach logs.
    const secret = 'orderful_secret_key_never_in_a_message'
    const loop = 'https://api.orderful.com/v3/transactions?nextCursor=LOOP'
    scripted([
      { ids: ['po-1'], next: loop },
      { ids: ['po-2'], next: loop },
    ])
    const err: unknown = await call('listPurchaseOrders', withPageSink({ page: 1, limit: 4 }), {
      accessToken: secret,
    }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/names itself as the next page/)
    expect((err as Error).message).not.toContain(secret)
  })
})

// ── Next links the fake never produces ───────────────────────────────────────

describe('orderful next links (metadata.pagination.links.next)', () => {
  const LISTS: Method[] = ['listSuppliers', 'listPurchaseOrders']
  const cases = <T extends object>(rows: T[]) =>
    LISTS.flatMap((m) => rows.map((r) => ({ m, ...r })))

  it.each(
    cases([
      {
        what: 'names nextCursor after a prevCursor',
        next: 'https://api.orderful.com/v3/relationships?prevCursor=P1&nextCursor=N1',
        cursor: 'N1',
      },
      {
        what: 'ends in a fragment',
        next: 'https://api.orderful.com/v3/relationships?nextCursor=N1#page',
        cursor: 'N1',
      },
      {
        what: 'is relative, with nextCursor second',
        next: '/v3/transactions?limit=1&nextCursor=Mjk3NDk%3D',
        cursor: 'Mjk3NDk=',
      },
      {
        what: "holds a raw base64 '+', which stays a plus and not a space",
        next: 'https://api.orderful.com/v3/transactions?nextCursor=ab+c%3D',
        cursor: 'ab+c=',
      },
    ]),
  )('$m: a next link that $what sends page 2 the cursor $cursor', async ({ m, next, cursor }) => {
    const { seen } = scripted([
      { ids: ['r1'], next },
      { ids: ['r2'], next: null },
    ])
    expect(await call(m, withPageSink({ page: 2, limit: 1 }))).toEqual(['r2'])
    expect(seen).toHaveLength(2)
    expect(seen[1]!['nextCursor']).toBe(cursor)
  })

  it.each(
    cases([
      { what: 'has no nextCursor', next: 'https://api.orderful.com/v3/relationships?limit=4' },
      {
        what: 'has an empty nextCursor',
        next: 'https://api.orderful.com/v3/relationships?limit=4&nextCursor=',
      },
      {
        what: 'has a malformed percent escape',
        next: 'https://api.orderful.com/v3/relationships?nextCursor=%E0%A4%A',
      },
    ]),
  )('$m: a next link that $what is a 502, not the end of the walk', async ({ m, next }) => {
    const { seen } = scripted([
      { ids: ['r1'], next },
      { ids: ['r2'], next: null },
    ])
    await expect(call(m, withPageSink({ page: 1, limit: 1 }))).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
      message: expect.stringMatching(/no usable nextCursor/),
    })
    // Nothing went out with an empty or half-decoded cursor.
    expect(seen).toHaveLength(1)
  })

  it.each(LISTS)('%s: an empty next link ends the walk, as a null one does', async (m) => {
    const { seen } = scripted([{ ids: ['r1'], next: '' }])
    const params = withPageSink({ page: 1, limit: 1 })
    expect(await call(m, params)).toEqual(['r1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(seen).toHaveLength(1)
  })
})

// ── getSupplier: GET /v3/relationships walked to the id ──────────────────────

describe('orderful getSupplier (no single-relationship read: walks GET /v3/relationships)', () => {
  const only = (relationships: number) =>
    fakeOrderful({ accounts: { [KEY_A]: { relationships, purchaseOrders: 0 } } })
  const get = (id: string) => adapter().getSupplier(CREDS, id)

  it('finds a relationship past the first page of 100', async () => {
    const { seen } = only(2 * RELATIONSHIPS_MAX + 1)
    const [id] = relIds(150, 1)
    expect((await get(id!)).id).toBe(id)
    expect(seen.map((s) => s.params['limit'])).toEqual([RELATIONSHIPS_MAX, RELATIONSHIPS_MAX])
    expect(seen[1]!.params['nextCursor']).toBeDefined()
  })

  it('stops at the page that holds the id', async () => {
    const { seen } = only(2 * RELATIONSHIPS_MAX + 1)
    const [id] = relIds(3, 1)
    expect((await get(id!)).id).toBe(id)
    expect(seen).toHaveLength(1)
  })

  it('an id on no page is a 404 once the chain ends, not a 500', async () => {
    const { seen } = only(2 * RELATIONSHIPS_MAX + 1)
    await expect(get('rel-99999')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(seen).toHaveLength(3)
  })

  it('a chain that loops back to a cursor it already sent is a 502, not an endless walk', async () => {
    const link = (c: string) => `https://api.orderful.com/v3/relationships?nextCursor=${c}`
    const { seen } = scripted([
      { ids: ['r1'], next: link('A') },
      { ids: ['r2'], next: link('B') },
      { ids: ['r3'], next: link('A') },
    ])
    await expect(get('missing')).rejects.toMatchObject({ statusCode: 502, code: 'UPSTREAM_ERROR' })
    expect(seen).toHaveLength(3)
  })
})
