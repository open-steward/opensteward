/**
 * Unicommerce (Uniware) stock levels, locations and purchase orders come from
 * endpoints with no paging at all: the adapter fetches the whole collection
 * and slices it into the caller's pages.
 *
 * What Uniware's own reference pages document for each request payload:
 *
 *   POST /inventory/inventorySnapshot/get  (Level: Facility)
 *     itemTypeSKUs, updatedSinceInMinutes ("Max.: 1440 minutes (24 Hours)")
 *     "The user can get inventory details based on only itemTypeSKUs or only
 *      updatedSinceInMinutes or both."  → inventorySnapshots[]
 *     https://documentation.unicommerce.com/docs/inventory-snapshot.html
 *
 *   POST /facility/search  (Level: Tenant)
 *     facilityStatus, fromDate, toDate, dateType  → parties[]
 *     https://documentation.unicommerce.com/docs/facility-search.html
 *
 *   POST /purchase/purchaseOrder/getPurchaseOrders  (Level: Tenant)
 *     approvedBetween, createdBetween  → purchaseOrderCodes[] ("PO records found")
 *     https://documentation.unicommerce.com/docs/purchaseorder_search.html
 *
 *   POST /purchase/purchaseOrder/getPurchaseOrderDetails  (Level: Facility)
 *     purchaseOrderCode  → the PO at the root of the response
 *     https://documentation.unicommerce.com/docs/get_purchase_order_details.html
 *
 * None of them has a page, offset, start or length parameter, and none
 * answers with a total or a next marker. Before the fix, stock levels and
 * locations returned the whole collection for every caller page (the router
 * truncated it to `limit`, so page 2 repeated page 1), and purchase orders
 * returned the first `limit` codes for every page.
 *
 * The fake below honours ONLY those pages. It refuses any payload key a page
 * does not document (a `displayStart`, `page` or `limit` would be one),
 * refuses a Facility-level call without the `Facility` header, and answers
 * every list request with every row matching it. None of the pages documents
 * an order, so the fake answers each list request in a different order.
 * Inventory snapshots honour `updatedSinceInMinutes`: SKUs last updated
 * outside the window are not returned.
 *
 * It also refuses a Tenant-level call that carries a `Facility` header. The
 * docs do not say Uniware refuses one; they list no Facility header for those
 * endpoints, and whether the header would narrow a tenant-wide search to one
 * facility is unverified. The refusal holds each call to its documented
 * level.
 *
 * It does not enforce the fields the docs mark mandatory on facility/search
 * and getPurchaseOrders (the adapter sends none of the date filters): that is
 * a separate follow-up, not paging.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { UnicommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/unicommerce/index'

const FACILITY = 'WH1'
const CREDS: Credentials = { accessToken: 'tok', extra: { tenant: 'acme', facility: FACILITY } }

/**
 * Purchase orders make one detail call per code on the page, so the largest
 * case (1,001 codes) needs about a thousand reads. A loop that keeps paging
 * past the end fails by name instead of hanging the worker.
 */
const CALL_BUDGET = 1100

const SNAPSHOT = '/inventory/inventorySnapshot/get'
const FACILITY_SEARCH = '/facility/search'
const PO_SEARCH = '/purchase/purchaseOrder/getPurchaseOrders'
const PO_DETAILS = '/purchase/purchaseOrder/getPurchaseOrderDetails'

/** Each endpoint's documented level and request payload keys. */
const DOCUMENTED: Readonly<
  Record<string, { level: 'Tenant' | 'Facility'; keys: readonly string[] }>
> = {
  [SNAPSHOT]: { level: 'Facility', keys: ['itemTypeSKUs', 'updatedSinceInMinutes'] },
  [FACILITY_SEARCH]: {
    level: 'Tenant',
    keys: ['facilityStatus', 'fromDate', 'toDate', 'dateType'],
  },
  [PO_SEARCH]: { level: 'Tenant', keys: ['approvedBetween', 'createdBetween'] },
  [PO_DETAILS]: { level: 'Facility', keys: ['purchaseOrderCode'] },
}

type Method = 'listStockLevels' | 'listLocations' | 'listPurchaseOrders'

interface Case {
  method: Method
  /** The list endpoint the method pages over. */
  path: string
  /** The response key that carries the collection. */
  listKey: string
  prefix: string
  /** The canonical id the adapter derives from an upstream code. */
  id: (code: string) => string
}

const CASES: Case[] = [
  {
    method: 'listStockLevels',
    path: SNAPSHOT,
    listKey: 'inventorySnapshots',
    prefix: 'sku',
    // Snapshots carry no facilityCode, so the transform keys them to 'all'.
    id: (code) => `${code}:all`,
  },
  {
    method: 'listLocations',
    path: FACILITY_SEARCH,
    listKey: 'parties',
    prefix: 'fac',
    id: (code) => code,
  },
  {
    method: 'listPurchaseOrders',
    path: PO_SEARCH,
    listKey: 'purchaseOrderCodes',
    prefix: 'po',
    id: (code) => code,
  },
]

function codes(c: Case, start: number, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${c.prefix}-${String(start + i).padStart(5, '0')}`,
  )
}

function ids(c: Case, start: number, count: number): string[] {
  return codes(c, start, count).map(c.id)
}

interface Seen {
  path: string
  body: Record<string, unknown>
  facility: string | undefined
}

function refuse(message: string, status = 400): never {
  throw Object.assign(new Error(message), { response: { status, data: { successful: false } } })
}

/**
 * How the fake answers getPurchaseOrderDetails for one code:
 * - `'body-error'`: HTTP 200 with the documented error envelope and no order.
 * - a number: that HTTP status.
 * - `'network'`: no response at all, as a reset socket or a timeout gives.
 */
type DetailFault = 'body-error' | 'network' | number

interface FakeOptions {
  /** Replaces the list endpoint's response. */
  listBody?: unknown
  /** Purchase-order codes whose detail call fails, and how. */
  detailFaults?: Readonly<Record<string, DetailFault>>
}

/** Snapshots last updated outside any window the adapter may ask for. */
const STALE_SKUS = 3

/**
 * A different order on every call, starting with the first: rotated by the
 * call number, and reversed on odd calls. The docs promise no order, so a
 * slice by offset must not rely on one.
 */
function reorder<T>(rows: readonly T[], call: number): T[] {
  if (rows.length === 0) return []
  const r = call % rows.length
  const rotated = [...rows.slice(r), ...rows.slice(0, r)]
  return call % 2 === 1 ? rotated.reverse() : rotated
}

/**
 * A fake Uniware at the axios seam the client uses: `axios.create` is called
 * once for the tenant-level instance and once for the facility-level one, and
 * each returned instance remembers the headers it was built with.
 *
 * `total` rows of the case's collection exist (for stock levels: `total` SKUs
 * updated within the last 24 hours, spread across it, plus `STALE_SKUS` older
 * ones). Every list request answers with all rows matching it, whatever page
 * the caller is on, because the platform has no paging parameter.
 */
function fakeUniware(c: Case, total: number, options: FakeOptions = {}) {
  const { listBody, detailFaults = {} } = options
  const all = codes(c, 1, total)
  const known = new Set(all)
  const seen: Seen[] = []
  /** The codes of each list answer, in the order the fake sent them. */
  const answers: string[][] = []

  // Minutes since each SKU's last inventory update: the in-window SKUs are
  // spread over the whole 24 hours, the stale ones are older than that.
  const snapshots = [
    ...all.map((sku, i) => ({ itemTypeSKU: sku, inventory: i + 1, minutesAgo: (i * 97) % 1441 })),
    ...Array.from({ length: STALE_SKUS }, (_, k) => ({
      itemTypeSKU: `${c.prefix}-stale-${k + 1}`,
      inventory: 1,
      minutesAgo: 1441 + k * 500,
    })),
  ]

  const answer = <T>(rows: readonly T[], code: (row: T) => string): T[] => {
    const sent = reorder(rows, answers.length + 1)
    answers.push(sent.map(code))
    return sent
  }

  const handle = (path: string, body: unknown, headers: Record<string, string>) => {
    if (seen.length >= CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    const payload = (body ?? {}) as Record<string, unknown>
    const facility = headers['Facility']
    seen.push({ path, body: payload, facility })

    const doc = DOCUMENTED[path]
    if (!doc) refuse(`unexpected POST ${path}`, 404)
    const undocumented = Object.keys(payload).filter((k) => !doc.keys.includes(k))
    if (undocumented.length > 0) refuse(`POST ${path} documents no ${undocumented.join(', ')}`)
    if (doc.level === 'Facility' && !facility) {
      refuse(`POST ${path} is Facility-level and needs the Facility header`)
    }
    if (doc.level === 'Tenant' && facility) {
      refuse(`POST ${path} is Tenant-level and documents no Facility header`)
    }

    switch (path) {
      case SNAPSHOT: {
        const since = payload['updatedSinceInMinutes']
        const skus = payload['itemTypeSKUs']
        if (since === undefined && skus === undefined) {
          refuse('inventorySnapshot/get needs itemTypeSKUs or updatedSinceInMinutes')
        }
        if (typeof since === 'number' && since > 1440) {
          refuse('updatedSinceInMinutes: Max.: 1440 minutes (24 Hours)')
        }
        if (path !== c.path) return { successful: true, inventorySnapshots: [] }
        if (listBody !== undefined) return listBody
        const matching = snapshots.filter(
          (s) =>
            (typeof since !== 'number' || s.minutesAgo <= since) &&
            (!Array.isArray(skus) || skus.includes(s.itemTypeSKU)),
        )
        return {
          successful: true,
          inventorySnapshots: answer(matching, (s) => s.itemTypeSKU).map(
            ({ itemTypeSKU, inventory }) => ({ itemTypeSKU, inventory }),
          ),
        }
      }
      case FACILITY_SEARCH: {
        if (path !== c.path) return { successful: true, parties: [] }
        if (listBody !== undefined) return listBody
        return {
          successful: true,
          parties: answer(all, (code) => code).map((code) => ({
            facilityCode: code,
            facilityStatus: 'ENABLED',
            created: 1448525889000,
            updated: 1705643877000,
          })),
        }
      }
      case PO_SEARCH: {
        if (path !== c.path) return { successful: true, purchaseOrderCodes: [] }
        if (listBody !== undefined) return listBody
        return { successful: true, purchaseOrderCodes: answer(all, (code) => code) }
      }
      case PO_DETAILS: {
        const code = String(payload['purchaseOrderCode'] ?? '')
        if (!known.has(code)) refuse(`purchase order ${code} not found`)
        const fault = detailFaults[code]
        if (fault === 'body-error') {
          return {
            successful: false,
            message: 'Invalid purchase order code',
            errors: [
              {
                code: 90001,
                fieldName: 'purchaseOrderCode',
                description: 'INVALID_PURCHASE_ORDER_CODE',
              },
            ],
          }
        }
        if (fault === 'network') {
          throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
        }
        if (typeof fault === 'number') refuse(`purchase order ${code} refused`, fault)
        return {
          successful: true,
          id: all.indexOf(code) + 1,
          code,
          statusCode: 'APPROVED',
          vendorCode: 'V1',
          purchaseOrderItems: [],
        }
      }
    }
    return refuse(`unhandled POST ${path}`, 404)
  }

  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const headers = { ...(config?.headers ?? {}) }
    return {
      post: vi.fn(async (path: string, body?: unknown) => ({ data: handle(path, body, headers) })),
      get: vi.fn(async (path: string) => refuse(`no GET is expected (${path})`, 405)),
    }
  }) as unknown as typeof axios.create)

  return { seen, answers }
}

const adapter = () => new UnicommerceAdapter({})
/** The method's rows, typed only as far as every case agrees: they have an id. */
const rows = async (c: Case, params: QueryParams): Promise<Array<{ id: string }>> =>
  adapter()[c.method](CREDS, params)
const call = async (c: Case, params: QueryParams): Promise<string[]> =>
  (await rows(c, params)).map((r) => r.id)

/** Drive a method as the sync worker does: withPageSink({ page, limit }) for pages 1..n. */
async function walk(c: Case, limit: number, pages = 3) {
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    served.push(...(await call(c, params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { served, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('unicommerce $method paging (POST $path, unpaginated)', (c) => {
  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeUniware(c, N)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(c, 1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is rows L+1..2L, not a repeat of page 1', async () => {
    fakeUniware(c, 9)
    expect(await call(c, withPageSink({ page: 2, limit: 4 }))).toEqual(ids(c, 5, 4))
  })

  it(`every page sends the same documented POST ${c.path}: the platform has no paging parameter`, async () => {
    const { seen } = fakeUniware(c, 9)
    await walk(c, 4)
    const listCalls = seen.filter((s) => s.path === c.path)
    expect(listCalls).toHaveLength(3)
    // Page 2 repeats page 1's request exactly: nothing positional is sent,
    // because nothing positional is documented.
    expect(listCalls[1]!.body).toEqual(listCalls[0]!.body)
    expect(listCalls[2]!.body).toEqual(listCalls[0]!.body)
  })

  it('reports the whole collection as totalCount and marks the page as paged locally', async () => {
    fakeUniware(c, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(c, params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeUniware(c, 2 * L)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(c, 1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('an empty collection is one empty last page', async () => {
    fakeUniware(c, 0)
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 0, hasMore: false, pagedLocally: true })
  })

  it(`a response without \`${c.listKey}\` is an empty collection, not an error`, async () => {
    fakeUniware(c, 0, { listBody: { successful: true } })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks every row at the worker limit of 500 (no declared max)', async () => {
    fakeUniware(c, 1001)
    const { served, hasMore } = await walk(c, 500)
    expect(served).toEqual(ids(c, 1, 1001))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router cap (500) is clamped, and every row is still served once', async () => {
    // None of these endpoints documents a size at all and the adapter declares
    // no capabilities.maxPageSize, so the only clamp is parseListQuery's own
    // cap; that is why parseListQuery is called without the adapter here.
    fakeUniware(c, 1001)
    const served: string[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '100000' })
      expect(params.limit).toBe(500)
      const env = listPage(await rows(c, params), params, 'unicommerce')
      expect(env.meta.limit).toBe(500)
      served.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(ids(c, 1, 1001))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeUniware(c, 15)
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '7' })
      expect(params.limit).toBe(7)
      served.push(...(await call(c, params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(c, 1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeUniware(c, 9)
    const p1 = parseListQuery({ page: '1', limit: '4' })
    const env1 = listPage(await rows(c, p1), p1, 'unicommerce')
    expect(env1.data.map((r) => r.id)).toEqual(ids(c, 1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' })
    const env3 = listPage(await rows(c, p3), p3, 'unicommerce')
    expect(env3.data.map((r) => r.id)).toEqual(ids(c, 9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    fakeUniware(c, 8)
    const p2 = parseListQuery({ page: '2', limit: '4' })
    const env2 = listPage(await rows(c, p2), p2, 'unicommerce')
    expect(env2.data.map((r) => r.id)).toEqual(ids(c, 5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: a request with no page is page 1', async () => {
    fakeUniware(c, 9)
    const params = parseListQuery({ limit: '4' })
    const env = listPage(await rows(c, params), params, 'unicommerce')
    expect(env.data.map((r) => r.id)).toEqual(ids(c, 1, 4))
    expect(env.meta.hasMore).toBe(true)
  })

  it('every request answers in a new order, and each page is sliced from the rows sorted by id', async () => {
    const { answers } = fakeUniware(c, 9)
    const { served, hasMore } = await walk(c, 4)
    // The fake did change the order between requests, and never sent it sorted.
    expect(answers).toHaveLength(3)
    expect(answers[1]).not.toEqual(answers[0])
    expect(answers[2]).not.toEqual(answers[1])
    for (const a of answers) expect(a).not.toEqual([...a].sort())
    expect(served).toEqual(ids(c, 1, 9))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a direct call with no limit gets every row and a known end, as pageLocally documents', async () => {
    // The router and the sync worker always send a limit; this pins the
    // behaviour for any other caller. 60 rows is more than the adapter's own
    // default page size (50), so a fallback to it would show.
    fakeUniware(c, 60)
    const params = withPageSink({})
    expect(await call(c, params)).toEqual(ids(c, 1, 60))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 60, hasMore: false, pagedLocally: true })
  })
})

describe('unicommerce listStockLevels request', () => {
  const c = CASES.find((x) => x.method === 'listStockLevels')!

  it('asks for the documented 24-hour window with the Facility header on every page', async () => {
    const { seen } = fakeUniware(c, 9)
    await walk(c, 4)
    expect(seen).toHaveLength(3)
    for (const s of seen) {
      expect(s).toEqual({
        path: SNAPSHOT,
        body: { updatedSinceInMinutes: 1440 },
        facility: FACILITY,
      })
    }
  })

  it('serves and counts only the SKUs in that window: the total is not every SKU', async () => {
    fakeUniware(c, 9)
    const params = withPageSink({ page: 1, limit: 50 })
    expect(await call(c, params)).toEqual(ids(c, 1, 9))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: false, pagedLocally: true })
    // The stale SKUs do exist: asked for by SKU, Uniware returns one.
    const stale = await adapter().getStockLevel(CREDS, 'sku-stale-1')
    expect(stale.id).toBe('sku-stale-1:all')
  })
})

describe('unicommerce listLocations request', () => {
  const c = CASES.find((x) => x.method === 'listLocations')!

  it('sends only the documented facilityStatus, at Tenant level, on every page', async () => {
    const { seen } = fakeUniware(c, 9)
    await walk(c, 4)
    expect(seen).toHaveLength(3)
    for (const s of seen) {
      expect(s).toEqual({
        path: FACILITY_SEARCH,
        body: { facilityStatus: 'ALL' },
        facility: undefined,
      })
    }
  })
})

describe('unicommerce listPurchaseOrders detail calls', () => {
  const c = CASES.find((x) => x.method === 'listPurchaseOrders')!

  it('page 2 fetches details for exactly its own codes, in order, after one search', async () => {
    const { seen } = fakeUniware(c, 9)
    await call(c, withPageSink({ page: 2, limit: 4 }))
    expect(seen.map((s) => s.path)).toEqual([PO_SEARCH, ...Array(4).fill(PO_DETAILS)])
    // The search is Tenant-level: no Facility header.
    expect(seen[0]).toEqual({ path: PO_SEARCH, body: {}, facility: undefined })
    expect(seen.slice(1).map((s) => s.body)).toEqual(
      codes(c, 5, 4).map((code) => ({ purchaseOrderCode: code })),
    )
  })

  it('a worker walk makes one detail call per code, never re-fetching an earlier page', async () => {
    const { seen } = fakeUniware(c, 9)
    await walk(c, 4)
    const details = seen
      .filter((s) => s.path === PO_DETAILS)
      .map((s) => s.body['purchaseOrderCode'])
    expect(details).toEqual(codes(c, 1, 9))
  })

  it('sends getPurchaseOrderDetails with the Facility header its Level: Facility requires', async () => {
    const { seen } = fakeUniware(c, 3)
    const served = await call(c, withPageSink({ page: 1, limit: 4 }))
    expect(served).toEqual(ids(c, 1, 3))
    const details = seen.filter((s) => s.path === PO_DETAILS)
    expect(details).toHaveLength(3)
    for (const d of details) expect(d.facility).toBe(FACILITY)
  })

  it('getPurchaseOrder sends the same Facility-level call with its header', async () => {
    const { seen } = fakeUniware(c, 3)
    const po = await adapter().getPurchaseOrder(CREDS, 'po-00002')
    expect(po.id).toBe('po-00002')
    expect(seen).toEqual([
      { path: PO_DETAILS, body: { purchaseOrderCode: 'po-00002' }, facility: FACILITY },
    ])
  })
})

describe('unicommerce listPurchaseOrders when a detail call fails', () => {
  const c = CASES.find((x) => x.method === 'listPurchaseOrders')!
  const detailCodes = (seen: Seen[]) =>
    seen.filter((s) => s.path === PO_DETAILS).map((s) => s.body['purchaseOrderCode'])

  afterEach(() => vi.useRealTimers())

  it.each([
    ['a body with the documented error envelope and no order', 'body-error'],
    ['HTTP 400', 400],
    ['HTTP 403', 403],
    ['HTTP 404', 404],
  ] as const)(
    'leaves out an order Uniware refuses (%s), and the walk goes on',
    async (_label, fault) => {
      fakeUniware(c, 9, { detailFaults: { 'po-00002': fault, 'po-00006': fault } })
      const { served, hasMore } = await walk(c, 4)
      expect(served).toEqual(ids(c, 1, 9).filter((id) => id !== 'po-00002' && id !== 'po-00006'))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('keeps the reported total at the number of codes, so the page is short of it', async () => {
    fakeUniware(c, 9, { detailFaults: { 'po-00002': 'body-error' } })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual(['po-00001', 'po-00003', 'po-00004'])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it.each([
    ['an expired token (HTTP 401)', 401, { response: { status: 401 } }],
    ['no response at all', 'network', { code: 'ECONNRESET' }],
  ] as const)('fails the page on %s instead of serving it short', async (_label, fault, error) => {
    const { seen } = fakeUniware(c, 9, { detailFaults: { 'po-00002': fault } })
    await expect(call(c, withPageSink({ page: 1, limit: 4 }))).rejects.toMatchObject(error)
    expect(detailCodes(seen)).toEqual(['po-00001', 'po-00002'])
  })

  it.each([429, 503])(
    'fails the page on HTTP %i still failing after the client retries it',
    async (status) => {
      vi.useFakeTimers()
      const { seen } = fakeUniware(c, 9, { detailFaults: { 'po-00002': status } })
      const page = call(c, withPageSink({ page: 1, limit: 4 }))
      const failed = expect(page).rejects.toMatchObject({ response: { status } })
      await vi.runAllTimersAsync()
      await failed
      // One try and four retries, then the error reaches the caller.
      expect(detailCodes(seen)).toEqual(['po-00001', ...Array(5).fill('po-00002')])
    },
  )
})
