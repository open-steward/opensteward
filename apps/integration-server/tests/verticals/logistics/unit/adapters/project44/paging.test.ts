/**
 * project44 list paging. Three list methods ignored the caller's `page`, so
 * page 2 repeated page 1 and nothing past the first page could be reached.
 *
 * First-party spec, https://developers.project44.com/_spec/api-reference/@v4/api-docs.json
 * (rendered at https://developers.project44.com/api-reference/api-docs):
 *
 * GET /api/v4/stoplocations (Stop Location Management) is offset-paged:
 *   "Paginated with default page size of 10. The offset and pageSize query
 *   parameters modify this behavior, allowing you to retrieve all of your
 *   locations one page at a time."
 *   offset: "The offset of the first requested location within the total list of locations."
 *   totalItems: "Total locations available."
 *
 * POST /api/v4/inventory/orders/search (Order Visibility) is page-numbered:
 *   page: "Page number valid range: [1, 50]"
 *   size: "Page size valid range: [1, 1000]"
 *   paginationInfo.total: "Total number of resource items matching the supplied criteria."
 * The request body is BasicInventoryOrderSearchCriteria, whose `pagination`
 * (PaginationParameters: pageNumber, pageSize) the adapter sends in step with
 * the query parameters. The old body's top-level `page`/`pageSize` are not
 * fields of that schema.
 *
 * GET /api/v4/capacityproviders documents no parameters and returns
 * "A list of all capacity providers matching the query." — the whole
 * collection, which the adapter pages locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { Project44Adapter } from '../../../../../../src/verticals/logistics/adapters/project44/index'

const CREDS = { accessToken: 'p44_test' }
const CALL_BUDGET = 40
const L = 5
const N = 2 * L + 1

const STOP_KEYS = new Set(['offset', 'pageSize'])
const ORDER_QUERY_KEYS = new Set(['page', 'size', 'sort'])
const ORDER_BODY_KEYS = new Set([
  'additionalOrderIdentifierCriteria',
  'billToLocationAddressText',
  'destinationLocationAddressText',
  'hasShipmentIds',
  'ids',
  'launchDateTime',
  'orderAttributes',
  'orderHealthCriteria',
  'orderIdentifierCriteria',
  'orderIdentifiers',
  'orderItemAdditionalIdentifierCriteria',
  'orderItemDescriptionCriteria',
  'orderItemIdentifierCriteria',
  'orderLocationCriteria',
  'orderSubmissionDateTime',
  'orderTagCriteria',
  'orderTypes',
  'originLocationAddressText',
  'originalDeliveryDateTimeWindowEnd',
  'originalDeliveryDateTimeWindowStart',
  'pagination',
  'relatedOrderIds',
  'searchText',
  'shipmentIds',
  'sort',
  'statusCodes',
  'supplierReadyDateTimeWindowEnd',
  'supplierReadyDateTimeWindowStart',
  'vendorLocationAddressText',
])
const ORDER_MAX_SIZE = 1000
const ORDER_MAX_PAGE = 50

interface Seed {
  stops?: number
  orders?: number
  carriers?: number
  /** Leave out the optional totals (StopLocationList.totalItems, paginationInfo.total). */
  omitTotal?: boolean
}

const clean = (p: Record<string, unknown> | undefined) =>
  Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined))

/** A fake project44 that honours ONLY the documented parameters of each list endpoint. */
function fakeProject44(seed: Seed) {
  let calls = 0
  const budget = () => {
    if (++calls > CALL_BUDGET) throw new Error(`call budget (${CALL_BUDGET}) exceeded`)
  }
  const stops = Array.from({ length: seed.stops ?? 0 }, (_, i) => ({
    id: `s${i + 1}`,
    name: `Stop ${i + 1}`,
  }))
  const orders = Array.from({ length: seed.orders ?? 0 }, (_, i) => ({
    id: `o${i + 1}`,
    orderIdentifier: `PO-${i + 1}`,
  }))
  const carriers = Array.from({ length: seed.carriers ?? 0 }, (_, i) => ({
    capacityProviderIdentifiers: [{ type: 'SCAC', value: `C${i + 1}` }],
    name: `Carrier ${i + 1}`,
  }))

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    budget()
    const params = clean(cfg?.params)
    if (path === '/stoplocations') {
      const bad = Object.keys(params).filter((k) => !STOP_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const offset = params.offset === undefined ? 0 : Number(params.offset)
      const pageSize = params.pageSize === undefined ? 10 : Number(params.pageSize)
      return {
        data: {
          locations: stops.slice(offset, offset + pageSize),
          offset,
          pageSize,
          ...(seed.omitTotal ? {} : { totalItems: stops.length }),
        },
      }
    }
    if (path === '/capacityproviders') {
      if (Object.keys(params).length) throw new Error('400: /capacityproviders takes no params')
      return { data: { capacityProviders: carriers } }
    }
    throw new Error(`unexpected GET ${path}`)
  })

  const post = vi.fn(
    async (path: string, body: unknown, cfg?: { params?: Record<string, unknown> }) => {
      budget()
      if (path !== '/inventory/orders/search') throw new Error(`unexpected POST ${path}`)
      const params = clean(cfg?.params)
      const bad = Object.keys(params).filter((k) => !ORDER_QUERY_KEYS.has(k))
      if (bad.length) throw new Error(`400: undocumented params ${bad.join(',')}`)
      const b = (body ?? {}) as Record<string, unknown>
      const badBody = Object.keys(b).filter((k) => !ORDER_BODY_KEYS.has(k))
      if (badBody.length) throw new Error(`400: undocumented body fields ${badBody.join(',')}`)
      const page = params.page === undefined ? 1 : Number(params.page)
      const size = params.size === undefined ? 30 : Number(params.size)
      if (!(page >= 1 && page <= ORDER_MAX_PAGE)) throw new Error(`400: page ${page}`)
      if (!(size >= 1 && size <= ORDER_MAX_SIZE)) throw new Error(`400: size ${size}`)
      // Body pagination, when sent, must agree with the query parameters.
      const pg = b.pagination as { pageNumber?: number; pageSize?: number } | undefined
      if (pg && (pg.pageNumber !== page || pg.pageSize !== size)) {
        throw new Error('400: body pagination disagrees with query')
      }
      const start = (page - 1) * size
      return {
        data: {
          results: orders.slice(start, start + size),
          paginationInfo: {
            pageNumber: page,
            pageSize: size,
            ...(seed.omitTotal ? {} : { total: orders.length }),
          },
        },
      }
    },
  )

  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post,
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  } as never)
  return { get, post }
}

interface Method {
  name: string
  seed: (n: number) => Seed
  call: (a: Project44Adapter, p: QueryParams) => Promise<unknown[]>
  prefix: string
}

const METHODS: Method[] = [
  {
    name: 'listWarehouses',
    seed: (n) => ({ stops: n }),
    call: (a, p) => a.listWarehouses(CREDS, p),
    prefix: 's',
  },
  {
    name: 'listOrders',
    seed: (n) => ({ orders: n }),
    call: (a, p) => a.listOrders(CREDS, p),
    prefix: 'o',
  },
  {
    name: 'listCarriers',
    seed: (n) => ({ carriers: n }),
    call: (a, p) => a.listCarriers(CREDS, p),
    prefix: 'C',
  },
]

const ids = (m: Method, n = N) => Array.from({ length: n }, (_, i) => `${m.prefix}${i + 1}`)
const byId = (r: unknown) => (r as { id: string }).id

afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('project44 $name paging', (m) => {
  const adapter = () => new Project44Adapter()

  it('N = 2L+1 rows: pages 1..3 at limit L return every id once, in order, with exact hasMore', async () => {
    fakeProject44(m.seed(N))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await m.call(adapter(), params)
      seen.push(...rows.map(byId))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(m))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery -> adapter -> listPage serves page 2 with exact meta', async () => {
    fakeProject44(m.seed(N))
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await m.call(adapter(), params), params, 'project44')
    expect(env.data.map(byId)).toEqual(ids(m).slice(L, 2 * L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })

  it('N = 2L rows: the full last page reads as the end, from the reported total', async () => {
    fakeProject44(m.seed(2 * L))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await m.call(adapter(), params)
    expect(rows.map(byId)).toEqual(ids(m, 2 * L).slice(L))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 2 * L }),
    )
  })

  it('a router limit above the maximum is clamped and still serves every row', async () => {
    fakeProject44(m.seed(N))
    const params = parseListQuery({ page: '1', limit: '100000' })
    expect(params.limit).toBeLessThan(100000)
    const rows = await m.call(adapter(), params)
    expect(rows.map(byId)).toEqual(ids(m))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('project44 page-2 requests carry the documented key', () => {
  it('listWarehouses sends offset = (page - 1) x pageSize', async () => {
    const { get } = fakeProject44({ stops: N })
    await new Project44Adapter().listWarehouses(CREDS, withPageSink({ page: 2, limit: L }))
    expect(get.mock.calls.at(-1)![0]).toBe('/stoplocations')
    expect(get.mock.calls.at(-1)![1]).toEqual({ params: { offset: L, pageSize: L } })
  })

  it('listOrders sends query page/size and matching body pagination', async () => {
    const { post } = fakeProject44({ orders: N })
    await new Project44Adapter().listOrders(CREDS, withPageSink({ page: 2, limit: L }))
    const [path, body, cfg] = post.mock.calls.at(-1)!
    expect(path).toBe('/inventory/orders/search')
    expect(cfg).toEqual({ params: { page: 2, size: L } })
    expect(body).toEqual({ pagination: { pageNumber: 2, pageSize: L } })
  })

  it('listCarriers fetches the whole collection once per caller page and slices it', async () => {
    const { get } = fakeProject44({ carriers: N })
    const params = withPageSink({ page: 2, limit: L })
    await new Project44Adapter().listCarriers(CREDS, params)
    expect(get.mock.calls).toHaveLength(1)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ pagedLocally: true, totalCount: N }),
    )
  })
})

describe('project44 paging without the optional total', () => {
  const cases = METHODS.filter((m) => m.name !== 'listCarriers')
  it.each(cases)(
    '$name: a missing total falls back to full-page-means-more, short-page-means-end',
    async (m) => {
      fakeProject44({ ...m.seed(N), omitTotal: true })
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        seen.push(...(await m.call(new Project44Adapter(), params)).map(byId))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids(m))
      expect(more).toEqual([true, true, false])
    },
  )
})

describe('project44 listOrders limits', () => {
  it('a direct limit above size 1000 is clamped to 1000 and reported as the page size', async () => {
    const { post } = fakeProject44({ orders: 1500 })
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await new Project44Adapter().listOrders(CREDS, params)
    expect(post.mock.calls[0]![2]).toEqual({ params: { page: 1, size: ORDER_MAX_SIZE } })
    expect(rows).toHaveLength(ORDER_MAX_SIZE)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: ORDER_MAX_SIZE, totalCount: 1500 }),
    )
  })

  it('page 2 of a clamped size strides by the size sent, not the limit asked for', async () => {
    const { post } = fakeProject44({ orders: 2500 })
    const params = withPageSink({ page: 2, limit: 5000 })
    const rows = await new Project44Adapter().listOrders(CREDS, params)
    expect(post.mock.calls[0]![2]).toEqual({ params: { page: 2, size: ORDER_MAX_SIZE } })
    expect(rows.map(byId)[0]).toBe('o1001')
    expect(rows).toHaveLength(ORDER_MAX_SIZE)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pageSize: ORDER_MAX_SIZE, totalCount: 2500 }),
    )
  })

  it('a page past the documented page range fails loudly instead of repeating a page', async () => {
    const { post } = fakeProject44({ orders: N })
    await expect(
      new Project44Adapter().listOrders(
        CREDS,
        withPageSink({ page: ORDER_MAX_PAGE + 1, limit: L }),
      ),
    ).rejects.toThrow(/page/)
    expect(post).not.toHaveBeenCalled()
  })
})
