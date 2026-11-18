/**
 * Revel list paging: 1-based `page` + caller's `limit` → Revel's `offset` +
 * `limit` query parameters, ordered by `id`, with `meta.next` reported as
 * `hasMore`.
 *
 * Revel's developer portal (https://developer.revelsystems.com/) serves its
 * OpenAPI suites from https://oas-prod.s3.amazonaws.com/oas/2025.3.0/. On
 * /resources/Product/ (products_suite.yaml), /resources/Customer/
 * (customers_suite.yaml), /resources/Order/ (orders_suite.yaml) and
 * /resources/Discount/ (discounts_suite.yaml):
 *   offset:   "Offset for returned results"
 *   limit:    "Limit for results count"   (schema `type: integer`, no maximum)
 *   order_by: enum including "id" on all four ("Field by which returned
 *             resources will be ordered" on Product and Order)
 *
 * Maximum `limit`. Across the 14 suites, 95 GET endpoints describe `limit` as
 * above, with no maximum — these four among them. 31 others (27 under
 * /resources/, e.g. /resources/Address/ in general_suite.yaml) say "Amount of
 * objects to return per query. This amount must be lower than 100 to avoid
 * high server load." and two /inventoryx/ endpoints say "lower than 1000". So
 * Revel states the ceiling per endpoint and states none for these four. The
 * adapter's own clamp is 500, the router's largest page, and it is declared as
 * `maxPageSize`. It is not lowered to 99 on the strength of other endpoints'
 * guidance: the router's DEFAULT limit is 100, so a 99 clamp would hand every
 * default API request a short page, which `collectionIsComplete` reads as the
 * whole collection.
 *
 * What makes a guess at the ceiling safe is that Revel says when it cut one.
 * Revel's list API is django-tastypie — Revel's own fork is
 * https://github.com/RevelSystems/django-tastypie, whose tastypie/paginator.py
 * reads:
 *   "If it's more than the max, we're only going to return the max."
 *   `return self.objects[offset:offset + limit]`   (offset is a ROW offset)
 *   `return self._generate_uri(limit, offset + limit)`   (the `next` link)
 * and puts the limit it actually used in `meta.limit`. The envelope is on
 * Revel's own docs page for the callback mechanism
 * (https://developer.revelsystems.com/revelsystems/docs/callback-mechanism,
 * archived at web.archive.org/web/20240723033243), answering GET
 * /resources/BankDrop with
 *   { "meta": { "limit": 20, "next": null, "offset": 0, "previous": null,
 *               "time_zone": null, "total_count": 0 }, "objects": [] }
 * So a `meta.limit` below the limit sent is a silent cap, and the client
 * throws on it instead of returning a short page the sync would take for the
 * last one.
 *
 * Ordering. Revel's FAQ
 * (https://developer.revelsystems.com/revelsystems/docs/frequently-asked-questions,
 * archived at web.archive.org/web/20231129032035) says "Results can be sorted
 * by using the `order_by` parameter", and of ids "This ID is an
 * auto-incremented ID and is equivalent to a primary key." Without `order_by`
 * the fork's `apply_sorting` does "Nothing to alter the order. Return what
 * we've got.", and Revel documents no default order, so offsets over an
 * unordered list may skip or repeat rows between requests. The adapter sends
 * `order_by=id`. The same FAQ's example URLs carry `?format=json`, which the
 * adapter has always sent.
 *
 * Three lists were on paths the 2025.3.0 suites do not have, and now use the
 * documented ones:
 *   listCollections  /resources/ProductCategory/ → /products/ProductCategory/
 *                    (products_suite.yaml: offset "Offset for returned results",
 *                    limit "Limit for results count", order_by enum
 *                    sorting, id, -sorting, -id)
 *   listLocations    /resources/Establishment/ → /enterprise/Establishment/
 *                    (general_suite.yaml: limit "Amount of objects to return per
 *                    query. This amount must be lower than 100 to avoid high
 *                    server load.", offset "Offset value for returned resources.
 *                    Used in conjunction with the limit parameter to return
 *                    resources in "pages".", order_by enum id, -id). A caller's
 *                    page of more than 99 rows is read 99 rows per request.
 *   listTransactions /resources/OrderPayment/ → /resources/Payment/
 *                    (orders_suite.yaml: offset and limit as on Product/,
 *                    order_by enum id, created_date, -id, -created_date)
 * All three send `order_by=id` like the other lists: ascending by the
 * auto-incremented key, so a row created during a walk lands after it rather
 * than pushing every later row down one offset.
 *
 * Both /products/ and /enterprise/ answers are documented as a bare JSON array
 * (`type: array`), not the `{ meta, objects }` envelope; the client reads either.
 * A bare answer carries no `meta.limit`, so a silently cut `limit` cannot be
 * told from the end of the collection by the answer alone. A short bare answer
 * is therefore not taken as the end: the adapter asks for the next row, and
 * only an empty answer ends the collection (then reported as `hasMore: false`).
 * That costs one empty request at the end of a collection, never a lost row.
 *
 * The single-record calls moved with the lists, to the documented
 * /products/ProductCategory/{ProductCategoryId}/ (GET, PATCH; POST on the list
 * path), /enterprise/Establishment/{EstablishmentId}/ (GET) and
 * /resources/Payment/{PaymentId}/ (GET), so a listed id resolves through the
 * same resource. No DELETE is documented on ProductCategory; deleteCollection
 * sends it to the documented resource URL all the same.
 *
 * Two lists have no documented path at all — /resources/InventoryProduct/
 * (listInventoryLevels) and /resources/OrderRefund/ (listRefunds). Paging is the
 * same Tastypie `offset` + `limit` on every /resources/ list above, so they
 * send the same row offset and size; they send no `order_by`, since no values
 * are documented for them, and a dead path still throws. The fake serves them in
 * id order only so that the offsets can be checked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  parseListQuery,
  withPageSink,
  readUpstreamPage,
  type QueryParams,
} from '@opensteward/shared'
import { RevelAdapter } from '../../../../../../src/verticals/ecommerce/adapters/revel/index'

const CREDS = { accessToken: 'rvl_test', extra: { subdomain: 'acme', apiKey: 'k', apiSecret: 's' } }
/** The adapter's own clamp (the router's largest page); Revel documents none for these paths. */
const ADAPTER_MAX = 500
const ADAPTER_DEFAULT = 100
/** Tastypie's default `max_limit` in Revel's fork. */
const TASTYPIE_MAX_LIMIT = 1000
const N_ROWS = 1200

interface FakeOptions {
  /** Tastypie `max_limit`: a larger `limit` is silently cut to this. */
  maxLimit?: number
  /** Answer without the `meta` block (never seen from Revel; pins "report only what was said"). */
  withMeta?: boolean
  /** Answer with a bare JSON array, as the suites document /products/ and /enterprise/ lists. */
  bare?: boolean
  /** Serve an unordered request in id order (paths whose order is undocumented). */
  stableUnordered?: boolean
  /** Serve at most this many rows per answer, yet echo the limit asked in meta.limit. */
  serves?: number
}

/**
 * A fake Revel (Tastypie) that honours ONLY the documented list parameters:
 * `offset` (rows skipped, default 0), `limit` (cut to `max_limit` without an
 * error, as Tastypie does) and `order_by` (only the path's documented values).
 * Without `order_by` it serves the rows in an arbitrary order that changes
 * from request to request, as an unordered query may. `format` is tolerated.
 * It answers in the `{ meta, objects }` envelope, with `meta.limit` the limit
 * it actually used and `meta.next` null on the last page.
 */
function fakeRevel(
  path: string,
  orderBy: readonly string[],
  total: number,
  opts: FakeOptions = {},
) {
  const maxLimit = opts.maxLimit ?? TASTYPIE_MAX_LIMIT
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  let calls = 0
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    calls++
    if (p !== path) throw new Error(`unexpected path ${p} (expected ${path})`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter(
      (k) => !['offset', 'limit', 'order_by', 'format'].includes(k),
    )
    if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
    const offset = params['offset'] ?? 0
    const asked = params['limit'] ?? 20
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      throw new Error(`offset must be an integer >= 0 (got ${String(offset)})`)
    }
    if (typeof asked !== 'number' || !Number.isInteger(asked) || asked < 1) {
      throw new Error(`limit must be an integer >= 1 (got ${String(asked)})`)
    }
    const order = params['order_by']
    if (order !== undefined && !orderBy.includes(String(order))) {
      throw new Error(`order_by must be one of ${orderBy.join(', ')} (got ${String(order)})`)
    }
    const limit = Math.min(asked, maxLimit)
    const rows =
      order === 'id' || (order === undefined && opts.stableUnordered)
        ? all
        : order === '-id'
          ? [...all].reverse()
          : [...all].sort(
              (a, b) =>
                ((a.id * 7919 + calls * 104729) % 1009) - ((b.id * 7919 + calls * 104729) % 1009),
            )
    const objects = rows.slice(offset, offset + Math.min(limit, opts.serves ?? limit))
    if (opts.bare) return { data: objects }
    if (opts.withMeta === false) return { data: { objects } }
    const next =
      offset + limit < total ? `/resources/${path}?limit=${limit}&offset=${offset + limit}` : null
    return { data: { meta: { limit, offset, total_count: total, previous: null, next }, objects } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Call = (a: RevelAdapter, p: QueryParams) => Promise<string[]>

const byId =
  <T extends { id: string }>(fn: (a: RevelAdapter, p: QueryParams) => Promise<T[]>): Call =>
  async (a, p) =>
    (await fn(a, p)).map((r) => r.id)

/** `order_by` values each path documents in the 2025.3.0 suites. */
const ID_ONLY = ['id', '-id']
const HOST = 'https://acme.revelup.com'

interface Method {
  name: string
  /** As the client is asked for it: relative to /resources/, or absolute. */
  path: string
  /** The path's documented `order_by` values (none: its order is undocumented). */
  orderBy: readonly string[]
  /** The order the adapter asks for. */
  orderSent?: 'id' | '-id'
  /** Largest `limit` the path documents per request. */
  perRequest?: number
  /** Documented only as a bare JSON array. */
  bareDocumented?: boolean
  call: Call
}

const METHODS: readonly Method[] = [
  {
    name: 'listProducts',
    path: 'Product/',
    orderBy: ['sorting', 'id', '-sorting', '-id'],
    orderSent: 'id',
    call: byId((a, p) => a.listProducts(CREDS, p)),
  },
  {
    name: 'listCustomers',
    path: 'Customer/',
    orderBy: ID_ONLY,
    orderSent: 'id',
    call: byId((a, p) => a.listCustomers(CREDS, p)),
  },
  {
    name: 'listOrders',
    path: 'Order/',
    orderBy: [
      'updated_date',
      'pickup_time',
      'running_tax_number',
      'id',
      'created_date',
      '-updated_date',
      '-pickup_time',
      '-running_tax_number',
      '-id',
      '-created_date',
    ],
    orderSent: 'id',
    call: byId((a, p) => a.listOrders(CREDS, p)),
  },
  {
    name: 'listDiscounts',
    path: 'Discount/',
    orderBy: ID_ONLY,
    orderSent: 'id',
    call: byId((a, p) => a.listDiscounts(CREDS, p)),
  },
  {
    name: 'listCollections',
    path: `${HOST}/products/ProductCategory/`,
    orderBy: ['sorting', 'id', '-sorting', '-id'],
    orderSent: 'id',
    bareDocumented: true,
    call: byId((a, p) => a.listCollections(CREDS, p)),
  },
  {
    name: 'listLocations',
    path: `${HOST}/enterprise/Establishment/`,
    orderBy: ID_ONLY,
    orderSent: 'id',
    perRequest: 99,
    bareDocumented: true,
    call: byId((a, p) => a.listLocations(CREDS, p)),
  },
  {
    name: 'listTransactions',
    path: 'Payment/',
    orderBy: ['id', 'created_date', '-id', '-created_date'],
    orderSent: 'id',
    call: byId((a, p) => a.listTransactions(CREDS, p)),
  },
  {
    name: 'listInventoryLevels',
    path: 'InventoryProduct/',
    orderBy: [],
    call: byId((a, p) => a.listInventoryLevels(CREDS, p)),
  },
  {
    name: 'listRefunds',
    path: 'OrderRefund/',
    orderBy: [],
    call: byId((a, p) => a.listRefunds(CREDS, p)),
  },
]

/** Rows `[offset, offset + count)` of a path of `total` rows, in the order the adapter asks for. */
function rowsOf(m: Method, total: number, offset: number, count: number): string[] {
  const all = ids(1, total)
  if (m.orderSent === '-id') all.reverse()
  return all.slice(offset, offset + count)
}

/** The requests one caller page of `size` rows from `offset` makes: one, or one per `perRequest` rows. */
function requestsOf(m: Method, offset: number, size: number) {
  const step = m.perRequest ?? size
  const out: Array<{ offset: number; limit: number; order_by: string | undefined }> = []
  for (let got = 0; got < size; got += step) {
    out.push({ offset: offset + got, limit: Math.min(step, size - got), order_by: m.orderSent })
  }
  return out
}

afterEach(() => vi.restoreAllMocks())

describe('revel capabilities', () => {
  it('declares the adapter clamp (500) so the sync worker never asks for more', () => {
    expect(new RevelAdapter().capabilities).toEqual(
      expect.objectContaining({ maxPageSize: ADAPTER_MAX }),
    )
  })
})

describe.each(METHODS)('revel $name paging', (m) => {
  const { path, orderBy, call } = m
  const adapter = () => new RevelAdapter()
  const run = (query: Record<string, string>) => call(adapter(), parseListQuery(query))
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return call(adapter(), params)
  }
  const fake = (total: number, opts?: FakeOptions) =>
    fakeRevel(path, orderBy, total, { stableUnordered: m.orderSent === undefined, ...opts })
  const sent = (get: ReturnType<typeof fakeRevel>['get']) =>
    get.mock.calls.map((c) => {
      const { offset, limit, order_by } = (c[1]?.params ?? {}) as Record<string, unknown>
      return { offset, limit, order_by }
    })

  it('page 1 returns the first rows and asks Revel for offset=0', async () => {
    const { get } = fake(N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(rowsOf(m, N_ROWS, 0, 10))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(path, {
      params: {
        offset: 0,
        limit: 10,
        format: 'json',
        ...(m.orderSent ? { order_by: m.orderSent } : {}),
      },
    })
  })

  it('page 2 returns the next rows (offset=10)', async () => {
    const { get } = fake(N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(rowsOf(m, N_ROWS, 10, 10))
    expect(sent(get)).toEqual(requestsOf(m, 10, 10))
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fake(N_ROWS)
    expect(await run({ limit: '10' })).toEqual(rowsOf(m, N_ROWS, 0, 10))
    expect(sent(get)).toEqual(requestsOf(m, 0, 10))
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3, Number.NaN])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fake(N_ROWS)
    expect(await runAt(page)).toEqual(rowsOf(m, N_ROWS, 0, 10))
    expect(sent(get)).toEqual(requestsOf(m, 0, 10))
  })

  it('a limit above the adapter clamp (500) is clamped, and page 2 strides by the clamp', async () => {
    const { get } = fake(N_ROWS)
    expect(await call(adapter(), { page: 1, limit: 1000 })).toEqual(
      rowsOf(m, N_ROWS, 0, ADAPTER_MAX),
    )
    expect(await call(adapter(), { page: 2, limit: 1000 })).toEqual(
      rowsOf(m, N_ROWS, ADAPTER_MAX, ADAPTER_MAX),
    )
    expect(sent(get)).toEqual([
      ...requestsOf(m, 0, ADAPTER_MAX),
      ...requestsOf(m, ADAPTER_MAX, ADAPTER_MAX),
    ])
  })

  it('a direct call with no page or limit keeps the adapter default of 100 from the first row', async () => {
    const { get } = fake(N_ROWS)
    expect(await call(adapter(), {})).toEqual(rowsOf(m, N_ROWS, 0, ADAPTER_DEFAULT))
    expect(sent(get)).toEqual(requestsOf(m, 0, ADAPTER_DEFAULT))
  })

  it('a direct call for page 2 with no limit strides by the default of 100', async () => {
    const { get } = fake(N_ROWS)
    expect(await call(adapter(), { page: 2 })).toEqual(
      rowsOf(m, N_ROWS, ADAPTER_DEFAULT, ADAPTER_DEFAULT),
    )
    expect(sent(get)).toEqual(requestsOf(m, ADAPTER_DEFAULT, ADAPTER_DEFAULT))
  })

  it.each([
    [0, ADAPTER_DEFAULT],
    [-5, ADAPTER_DEFAULT],
    [Number.NaN, ADAPTER_DEFAULT],
    [7.5, 7],
  ])('a direct call with limit %s asks for a valid size (%i)', async (limit, size) => {
    const { get } = fake(N_ROWS)
    expect(await call(adapter(), { limit } as QueryParams)).toEqual(rowsOf(m, N_ROWS, 0, size))
    expect(sent(get)).toEqual(requestsOf(m, 0, size))
  })

  it("reports Revel's meta.next as hasMore: true before the last page, false on it", async () => {
    fake(25)
    const first = withPageSink({ page: 1, limit: 10 })
    await call(adapter(), first)
    expect(readUpstreamPage(first)).toEqual({ hasMore: true })
    const last = withPageSink({ page: 3, limit: 10 })
    expect(await call(adapter(), last)).toEqual(rowsOf(m, 25, 20, 5))
    expect(readUpstreamPage(last)).toEqual({ hasMore: false })
  })

  it('reports nothing when a response carries no meta, rather than guessing', async () => {
    fake(25, { withMeta: false })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await call(adapter(), params)).toEqual(rowsOf(m, 25, 0, 10))
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('reads a bare JSON array answer too, reporting nothing about what follows', async () => {
    fake(25, { bare: true })
    const params = withPageSink({ page: 2, limit: 10 })
    expect(await call(adapter(), params)).toEqual(rowsOf(m, 25, 10, 10))
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('throws, naming the cap, when Revel silently cuts the limit (meta.limit < limit sent)', async () => {
    fake(N_ROWS, { maxLimit: 50 })
    await expect(call(adapter(), withPageSink({ page: 1, limit: 60 }))).rejects.toThrow(
      /Revel .*50 .*60/,
    )
  })

  it('does not throw when the limit sent is within the cap', async () => {
    fake(N_ROWS, { maxLimit: 100 })
    expect(await call(adapter(), withPageSink({ page: 2, limit: 100 }))).toEqual(
      rowsOf(m, N_ROWS, 100, 100),
    )
  })

  /** Drive pages 1, 2, … exactly as SyncWorker does: its word when reported, else a short page. */
  async function walk(limit: number) {
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const params = withPageSink({ page: k, limit })
      const page = await call(adapter(), params)
      // The router truncates an over-return to the caller's limit.
      expect(page.length).toBeLessThanOrEqual(limit)
      seen.push(...page)
      const said = readUpstreamPage(params)?.hasMore
      if (typeof said === 'boolean' ? !said : page.length < limit) break
    }
    return seen
  }

  it.each([10, 7, 500])(
    'walks every row exactly once, in order, driven like the sync (limit %i, N = 2L + 1)',
    async (limit) => {
      const n = 2 * limit + 1
      const { get } = fake(n)
      expect(await walk(limit)).toEqual(rowsOf(m, n, 0, n))
      const perPage = requestsOf(m, 0, limit).length
      expect(get).toHaveBeenCalledTimes(2 * perPage + 1)
    },
  )

  it.each([10, 7])(
    'stops on meta.next without an extra empty request when N is an exact multiple (limit %i, N = 2L)',
    async (limit) => {
      const n = 2 * limit
      const { get } = fake(n)
      expect(await walk(limit)).toEqual(rowsOf(m, n, 0, n))
      expect(get).toHaveBeenCalledTimes(2)
    },
  )
})

describe.each(METHODS.filter((m) => m.bareDocumented))(
  'revel $name, answered as its suite documents it (a bare array)',
  (m) => {
    const sent = (get: ReturnType<typeof fakeRevel>['get']) =>
      get.mock.calls.map((c) => {
        const { offset, limit } = (c[1]?.params ?? {}) as Record<string, unknown>
        return { offset, limit }
      })

    it.each([10, 7, 500])(
      'walks every row exactly once, the end confirmed by an empty answer (limit %i, N = 2L + 1)',
      async (limit) => {
        const n = 2 * limit + 1
        const { get } = fakeRevel(m.path, m.orderBy, n, { bare: true })
        const seen: string[] = []
        const said: Array<boolean | undefined> = []
        for (let k = 1; k <= 10; k++) {
          const params = withPageSink({ page: k, limit })
          const page = await m.call(new RevelAdapter(), params)
          seen.push(...page)
          said.push(readUpstreamPage(params)?.hasMore)
          const hasMore = readUpstreamPage(params)?.hasMore
          if (typeof hasMore === 'boolean' ? !hasMore : page.length < limit) break
        }
        expect(seen).toEqual(rowsOf(m, n, 0, n))
        // Full pages say nothing; the last one says it is the last.
        expect(said).toEqual([undefined, undefined, false])
        // Two full pages, then the one-row page and the empty answer that ends it.
        expect(get).toHaveBeenCalledTimes(2 * requestsOf(m, 0, limit).length + 2)
      },
    )

    it('a short bare answer is not the end: the next row is asked for, and an empty answer ends it', async () => {
      const { get } = fakeRevel(m.path, m.orderBy, 30, { bare: true })
      const params = withPageSink({ page: 1, limit: 50 })
      expect(await m.call(new RevelAdapter(), params)).toEqual(rowsOf(m, 30, 0, 30))
      expect(sent(get)).toEqual([
        { offset: 0, limit: 50 },
        { offset: 30, limit: 20 },
      ])
      expect(readUpstreamPage(params)).toEqual({ hasMore: false })
    })

    it('a limit Revel silently cuts on a bare answer still fills the page, losing no row', async () => {
      // No meta.limit to read the cut from: 20 rows per answer, whatever is asked.
      const { get } = fakeRevel(m.path, m.orderBy, N_ROWS, { bare: true, maxLimit: 20 })
      const params = withPageSink({ page: 2, limit: 50 })
      expect(await m.call(new RevelAdapter(), params)).toEqual(rowsOf(m, N_ROWS, 50, 50))
      expect(sent(get)).toEqual([
        { offset: 50, limit: 50 },
        { offset: 70, limit: 30 },
        { offset: 90, limit: 10 },
      ])
      expect(readUpstreamPage(params)).toBeUndefined()
    })
  },
)

describe('revel listLocations request size', () => {
  it('reads a caller page of 250 as 99 + 99 + 52 rows: the path says "lower than 100"', async () => {
    const m = METHODS.find((x) => x.name === 'listLocations')!
    const { get } = fakeRevel(m.path, m.orderBy, N_ROWS)
    expect(await m.call(new RevelAdapter(), parseListQuery({ page: '2', limit: '250' }))).toEqual(
      rowsOf(m, N_ROWS, 250, 250),
    )
    expect(get.mock.calls.map((c) => c[1]?.params?.['limit'])).toEqual([99, 99, 52])
    expect(get.mock.calls.map((c) => c[1]?.params?.['offset'])).toEqual([250, 349, 448])
  })

  it('stops at the first short request instead of asking past the end', async () => {
    const m = METHODS.find((x) => x.name === 'listLocations')!
    const { get } = fakeRevel(m.path, m.orderBy, 120)
    expect(await m.call(new RevelAdapter(), parseListQuery({ limit: '250' }))).toEqual(
      rowsOf(m, 120, 0, 120),
    )
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('answered bare, stops at the first EMPTY request: 99 + 21 rows, then one empty answer', async () => {
    const m = METHODS.find((x) => x.name === 'listLocations')!
    const { get } = fakeRevel(m.path, m.orderBy, 120, { bare: true })
    const params = withPageSink({ page: 1, limit: 250 })
    expect(await m.call(new RevelAdapter(), params)).toEqual(rowsOf(m, 120, 0, 120))
    expect(get.mock.calls.map((c) => [c[1]?.params?.['offset'], c[1]?.params?.['limit']])).toEqual([
      [0, 99],
      [99, 99],
      [120, 99],
    ])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it("reports the LAST request's meta.next: a page ending exactly at the end has no more", async () => {
    const m = METHODS.find((x) => x.name === 'listLocations')!
    const { get } = fakeRevel(m.path, m.orderBy, 198)
    const params = withPageSink({ page: 1, limit: 198 })
    expect(await m.call(new RevelAdapter(), params)).toEqual(rowsOf(m, 198, 0, 198))
    expect(get).toHaveBeenCalledTimes(2)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it("reports the last request's meta.next when more remain after a multi-request page", async () => {
    const m = METHODS.find((x) => x.name === 'listLocations')!
    fakeRevel(m.path, m.orderBy, 199)
    const params = withPageSink({ page: 1, limit: 198 })
    expect(await m.call(new RevelAdapter(), params)).toEqual(rowsOf(m, 199, 0, 198))
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })
})

describe('revel trusts meta.next over the length of an answer', () => {
  const m = METHODS.find((x) => x.name === 'listProducts')!

  it('a short answer whose meta.next says more is topped up from where it ended, losing no row', async () => {
    const { get } = fakeRevel(m.path, m.orderBy, N_ROWS, { serves: 7 })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await m.call(new RevelAdapter(), params)).toEqual(ids(1, 10))
    expect(get.mock.calls.map((c) => [c[1]?.params?.['offset'], c[1]?.params?.['limit']])).toEqual([
      [0, 10],
      [7, 3],
    ])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('an empty answer ends the page even when meta.next says more, rather than asking forever', async () => {
    const { get } = fakeRevel(m.path, m.orderBy, N_ROWS, { serves: 0 })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await m.call(new RevelAdapter(), params)).toEqual([])
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('revel listRefunds order filter', () => {
  it.each(['order_id', 'orderId'])(
    'a direct caller\'s %s is sent as the `order` filter, beside the paging',
    async (key) => {
      const get = vi.fn(async () => ({ data: { meta: { limit: 10, next: null }, objects: [] } }))
      vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
      await new RevelAdapter().listRefunds(CREDS, { page: 2, limit: 10, [key]: '42' } as QueryParams)
      expect(get).toHaveBeenCalledWith('OrderRefund/', {
        params: { offset: 10, limit: 10, format: 'json', order: '42' },
      })
    },
  )

  it('sends no order filter when none is asked for', async () => {
    const get = vi.fn(async () => ({ data: { meta: { limit: 10, next: null }, objects: [] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await new RevelAdapter().listRefunds(CREDS, { page: 1, limit: 10 })
    expect(get).toHaveBeenCalledWith('OrderRefund/', {
      params: { offset: 0, limit: 10, format: 'json' },
    })
  })
})

describe('revel single records live where their lists do', () => {
  function fakeClient() {
    const calls: string[] = []
    const answer = (method: string) =>
      vi.fn(async (url: string) => {
        calls.push(`${method} ${url}`)
        return { data: { id: 7, name: 'x' } }
      })
    vi.spyOn(axios, 'create').mockReturnValue({
      get: answer('GET'),
      post: answer('POST'),
      put: answer('PUT'),
      patch: answer('PATCH'),
      delete: answer('DELETE'),
    } as never)
    return calls
  }

  it.each([
    ['getCollection', (a: RevelAdapter) => a.getCollection(CREDS, '7'), `GET ${HOST}/products/ProductCategory/7/`],
    ['createCollection', (a: RevelAdapter) => a.createCollection(CREDS, { title: 'Drinks' }), `POST ${HOST}/products/ProductCategory/`],
    ['updateCollection', (a: RevelAdapter) => a.updateCollection(CREDS, '7', { title: 'Drinks' }), `PATCH ${HOST}/products/ProductCategory/7/`],
    ['deleteCollection', (a: RevelAdapter) => a.deleteCollection(CREDS, '7'), `DELETE ${HOST}/products/ProductCategory/7/`],
    ['getLocation', (a: RevelAdapter) => a.getLocation(CREDS, '7'), `GET ${HOST}/enterprise/Establishment/7/`],
    ['getTransaction', (a: RevelAdapter) => a.getTransaction(CREDS, '7'), 'GET Payment/7/'],
  ] as const)('%s asks the documented resource the list reads', async (_name, run, expected) => {
    const calls = fakeClient()
    await run(new RevelAdapter())
    expect(calls).toEqual([expected])
  })
})

describe('revel lists never use the undocumented paths they replaced', () => {
  it.each([
    ['listCollections', 'ProductCategory/'],
    ['listLocations', 'Establishment/'],
    ['listTransactions', 'OrderPayment/'],
  ])('%s does not ask for /resources/%s', async (name, old) => {
    const m = METHODS.find((x) => x.name === name)!
    const { get } = fakeRevel(m.path, m.orderBy, N_ROWS)
    await m.call(new RevelAdapter(), parseListQuery({ limit: '10' }))
    expect(get.mock.calls.map((c) => c[0])).not.toContain(old)
    expect(get.mock.calls.map((c) => c[0])).toEqual([m.path])
  })
})
