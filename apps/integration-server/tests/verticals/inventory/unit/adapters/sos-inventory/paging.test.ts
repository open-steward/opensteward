/**
 * SOS Inventory pages every list by `start` + `maxresults`, and `start` is a
 * 1-based row number.
 *
 * The developer portal documents one pair of query parameters for every list
 * endpoint, the item list and the configuration endpoints (location among
 * them) alike, in the JS bundle that renders
 * https://developer.sosinventory.com/apidoc:
 *
 *   start       "A cursor used in pagination.  This is the row number of the
 *               full set of results. The API limits results to a max of 200
 *               results per call. [...] For example if you are retrieving 200
 *               results at a time, you can set start=201 to retrieve the next
 *               page of results."
 *   maxresults  "The maximum number of results you want to return.  The
 *               default is 200, the maximum value allowed."
 *
 * and one envelope, `{ count, totalCount, data, status, message }`, where
 * totalCount is "The total number of records that match the filters of this
 * query." The configuration section adds: "You may query for results in the
 * same manner you query for transactions [...] GET /api/v2/:endpoint?start=101
 * &maxresults=100", with GET /api/v2/location as its own example. Both worked
 * examples (201 after 200 rows, 101 after 100) are 1-based; the docs never
 * show a `start=0`.
 *
 * listLocations sent only `{ limit }`, which SOS does not document, and never
 * a `start`, so page 2 repeated page 1. listProducts and listStockLevels sent
 * `start = (page - 1) × limit`, a 0-based offset against a 1-based row
 * number, so every page repeated the previous page's last row; and none of
 * the three clamped to the 200-row maximum, so a sync page of 500 came back
 * as 200 and strode past rows 201-500.
 *
 * The fake upstream below is mounted at axios, the seam the client uses, and
 * honours only what the docs define: `start` as a 1-based row number (absent
 * is row 1), `maxresults` defaulting to and capped at 200, the envelope's
 * `count` and `totalCount`, and "GET /api/v2/:endpoint/:id" for one record.
 * Anything else, `limit` and `location` included, is ignored, as an
 * undocumented parameter would be (the fake does not model which items stock
 * at a location, only what was asked for). The docs do not define `start=0`;
 * the fake reads it as row 1, the most lenient reading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  declaredPageMax,
  openDb,
  ResourceStore,
  SyncStore,
  SyncWorker,
  CircuitBreaker,
  type DbHandle,
  type Credentials,
  type QueryParams,
  type UpstreamPageMeta,
} from '@opensteward/shared'
import { SosInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/sos-inventory/index'
import { LISTABLE_RESOURCES } from '../../../../../../src/verticals/inventory/sync/listable-resources'

type Row = Record<string, unknown>
type Query = Record<string, unknown>

const DOCUMENTED_MAX = 200
const creds = { accessToken: 'the-token' } as Credentials

/** Every request the fake upstream received, in order. */
const requests: Array<{ path: string; params: Query }> = []
/** Rows per list path, in the upstream's own order. */
let tables: Record<string, Row[]> = {}
/**
 * How the list envelope departs from the documented one: `totalCount` left
 * out or misreported, or `data` null (or left out) in place of an array.
 */
let envelope: { totalCount?: number | 'absent'; data?: null | 'absent' } = {}

function asRow(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isInteger(n) ? n : undefined
}

/** The upstream, answering only the documented query parameters. */
async function get(path: string, config?: { params?: Query }) {
  const params = { ...(config?.params ?? {}) }
  requests.push({ path, params })
  // "Retrieve a single record by id: GET /api/v2/:endpoint/:id", answered in
  // the documented result structure.
  const one = /^(\/(?:item|location))\/([^/]+)$/.exec(path)
  if (one) {
    const row = (tables[one[1]!] ?? []).find((r) => String(r['id']) === one[2])
    const data = row ? [row] : []
    return {
      data: { count: data.length, totalCount: data.length, data, status: 'ok', message: '' },
    }
  }
  const rows = tables[path]
  if (!rows) throw new Error(`fake upstream has no endpoint ${path}`)
  // "This is the row number of the full set of results." 1-based.
  const start = Math.max(asRow(params['start']) ?? 1, 1)
  // "The default is 200, the maximum value allowed."
  const asked = asRow(params['maxresults'])
  const size = asked === undefined || asked < 1 ? DOCUMENTED_MAX : Math.min(asked, DOCUMENTED_MAX)
  const data = rows.slice(start - 1, start - 1 + size)
  const body: Row = { count: data.length, status: 'ok', message: '' }
  if (envelope.data !== 'absent') body['data'] = envelope.data === null ? null : data
  if (envelope.totalCount !== 'absent') body['totalCount'] = envelope.totalCount ?? rows.length
  return { data: body }
}

beforeEach(() => {
  requests.length = 0
  tables = {}
  envelope = {}
  vi.spyOn(axios, 'create').mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const newAdapter = () =>
  new SosInventoryAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x/cb' })
/** The `start` of every request to one path, in order. */
const startsOn = (path: string) =>
  requests.filter((r) => r.path === path).map((r) => r.params['start'])

interface Case {
  method: string
  path: string
  /** Seed the upstream so the method's canonical list has exactly `n` rows. */
  seed: (n: number) => void
  /** The canonical ids of those `n` rows, in the upstream's order. */
  expected: (n: number) => string[]
  call: (a: SosInventoryAdapter, params: QueryParams) => Promise<Array<{ id: string }>>
}

const items = (n: number) =>
  range(n).map((i) => ({ id: 1000 + i, name: `Item ${i}`, sku: `SKU-${i}`, onhand: i }))
const locations = (n: number) => range(n).map((i) => ({ id: i, name: `Warehouse ${i}` }))

const CASES: Case[] = [
  {
    method: 'listProducts',
    path: '/item',
    seed: (n) => {
      tables['/item'] = items(n)
    },
    expected: (n) => range(n).map((i) => String(1000 + i)),
    call: (a, p) => a.listProducts(creds, p),
  },
  {
    method: 'listStockLevels',
    path: '/item',
    seed: (n) => {
      tables['/item'] = items(n)
    },
    expected: (n) => range(n).map((i) => String(1000 + i)),
    call: (a, p) => a.listStockLevels(creds, p),
  },
  {
    method: 'listLocations',
    path: '/location',
    seed: (n) => {
      tables['/location'] = locations(n)
    },
    expected: (n) => range(n).map(String),
    call: (a, p) => a.listLocations(creds, p),
  },
]

/** Drive a method the way the sync worker does: one page sink per page. */
async function drive(c: Case, limit: number, pages: number) {
  const adapter = newAdapter()
  const ids: string[] = []
  const reports: Array<UpstreamPageMeta | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await c.call(adapter, params)
    ids.push(...rows.map((r) => r.id))
    reports.push(readUpstreamPage(params))
  }
  return {
    ids,
    reports,
    hasMore: reports.map((r) => r?.hasMore),
    totals: reports.map((r) => r?.totalCount),
  }
}

it('declares the documented 200-row maximum', () => {
  expect(declaredPageMax(newAdapter())).toBe(DOCUMENTED_MAX)
})

describe.each(CASES)('sos-inventory $method pages by start + maxresults', (c) => {
  const L = 3

  it('serves N = 2L + 1 rows once each across three pages, ending on the third', async () => {
    const N = 2 * L + 1
    c.seed(N)
    const { ids, hasMore, totals } = await drive(c, L, 3)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('asks page 2 for row L + 1 at maxresults L, and nothing undocumented', async () => {
    c.seed(2 * L + 1)
    await drive(c, L, 2)
    expect(requests.map((r) => r.path)).toEqual([c.path, c.path])
    expect(requests[0]!.params).toEqual({ start: 1, maxresults: L })
    expect(requests[1]!.params).toEqual({ start: L + 1, maxresults: L })
  })

  it('ends on page 2 when N = 2L, although that page is full', async () => {
    const N = 2 * L
    c.seed(N)
    const { ids, hasMore } = await drive(c, L, 2)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, false])
  })

  it('ends where the next page would start past totalCount, even after a short page', async () => {
    // 2L - 1 rows served against a total of 2L: page 3 would start at row
    // 2L + 1, past every row the platform counts, so there is nothing to ask
    // it for. Counting only the rows served would spend an empty request.
    const N = 2 * L - 1
    c.seed(N)
    envelope.totalCount = 2 * L
    const { ids, hasMore } = await drive(c, L, 2)
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, false])
  })

  it('leaves the end to the short page when the envelope has no totalCount', async () => {
    // Nothing to judge a full page by: report the size asked for and no
    // verdict, so the worker keeps going past a full page and stops on a
    // short one. A guessed `hasMore: false` would end a sync on page 1 and
    // mark a truncated collection complete.
    const N = 2 * L + 1
    c.seed(N)
    envelope.totalCount = 'absent'
    const { ids, reports } = await drive(c, L, 3)
    expect(ids).toEqual(c.expected(N))
    expect(reports).toEqual([{ pageSize: L }, { pageSize: L }, { pageSize: L }])
  })

  it('serves an empty collection whose envelope carries data: null', async () => {
    c.seed(0)
    envelope.data = null
    const { ids, reports } = await drive(c, L, 1)
    expect(ids).toEqual([])
    expect(reports).toEqual([{ pageSize: L, totalCount: 0, hasMore: false }])
  })

  it('asks for 100 rows from row 1 when no limit is named', async () => {
    const N = 250
    c.seed(N)
    const adapter = newAdapter()
    const first = withPageSink({})
    const second = withPageSink({ page: 2 })
    expect((await c.call(adapter, first)).map((r) => r.id)).toEqual(c.expected(N).slice(0, 100))
    expect((await c.call(adapter, second)).map((r) => r.id)).toEqual(c.expected(N).slice(100, 200))
    expect(requests.map((r) => r.params)).toEqual([
      { start: 1, maxresults: 100 },
      { start: 101, maxresults: 100 },
    ])
    expect(readUpstreamPage(second)).toEqual({ pageSize: 100, totalCount: N, hasMore: true })
  })

  it('clamps a limit above the documented max to 200 and still serves every row', async () => {
    const N = 2 * DOCUMENTED_MAX + 1
    c.seed(N)
    const { ids, reports } = await drive(c, 250, 3)
    expect(ids).toEqual(c.expected(N))
    expect(requests.map((r) => r.params)).toEqual([
      { start: 1, maxresults: DOCUMENTED_MAX },
      { start: DOCUMENTED_MAX + 1, maxresults: DOCUMENTED_MAX },
      { start: 2 * DOCUMENTED_MAX + 1, maxresults: DOCUMENTED_MAX },
    ])
    // The size it asked for, so a 200-row page is not judged short of 250,
    // and nothing it cannot vouch for (no `pagedLocally`: every row came from
    // the upstream page it asked for).
    expect(reports).toEqual([
      { pageSize: DOCUMENTED_MAX, totalCount: N, hasMore: true },
      { pageSize: DOCUMENTED_MAX, totalCount: N, hasMore: true },
      { pageSize: DOCUMENTED_MAX, totalCount: N, hasMore: false },
    ])
  })

  it('caps a 500-row API ask at 200 through parseListQuery and still serves every row', async () => {
    const N = 2 * DOCUMENTED_MAX + 1
    c.seed(N)
    const adapter = newAdapter()
    const ids: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ limit: '500', page: String(page) }, adapter)
      expect(params.limit).toBe(DOCUMENTED_MAX)
      ids.push(...(await c.call(adapter, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(c.expected(N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('publishes an exact meta.hasMore on the API path', async () => {
    const N = 2 * L
    c.seed(N)
    const adapter = newAdapter()

    const p1 = parseListQuery({ limit: String(L) }, adapter)
    const env1 = listPage(await c.call(adapter, p1), p1, 'sos-inventory')
    expect(env1.data.map((r) => r.id)).toEqual(c.expected(N).slice(0, L))
    expect(env1.meta).toMatchObject({ page: 1, limit: L, hasMore: true, totalCount: N })

    // A full last page: a short-page guess would say null here.
    const p2 = parseListQuery({ limit: String(L), page: '2' }, adapter)
    const env2 = listPage(await c.call(adapter, p2), p2, 'sos-inventory')
    expect(env2.data.map((r) => r.id)).toEqual(c.expected(N).slice(L))
    expect(env2.meta).toMatchObject({ page: 2, limit: L, hasMore: false, totalCount: N })
    expect(requests[1]!.params).toEqual({ start: L + 1, maxresults: L })
  })
})

/**
 * GET /item's `location` filter "Filters items according to the name of the
 * location" (the docs' own example is `location=warehouse`), while the
 * canonical `locationId` is the id listLocations emits: SOS's numeric id.
 */
describe('sos-inventory listStockLevels at one location', () => {
  const withLocation = (page: number, locationId: string) =>
    Object.assign(withPageSink({ page, limit: 3 }), { locationId })

  it("filters by the location's name, beside start + maxresults, and keeps its id on each row", async () => {
    tables['/item'] = items(7)
    tables['/location'] = [
      { id: 7, name: 'Back Room' },
      { id: 9, name: 'Main Warehouse' },
    ]
    const adapter = newAdapter()
    const ids: string[] = []
    const locationIds: string[] = []
    for (let page = 1; page <= 3; page++) {
      const rows = await adapter.listStockLevels(creds, withLocation(page, '9'))
      ids.push(...rows.map((r) => r.id))
      locationIds.push(...rows.map((r) => r.locationId))
    }
    expect(ids).toEqual(range(7).map((i) => `${1000 + i}:9`))
    expect(new Set(locationIds)).toEqual(new Set(['9']))
    expect(requests.filter((r) => r.path === '/item').map((r) => r.params)).toEqual([
      { location: 'Main Warehouse', start: 1, maxresults: 3 },
      { location: 'Main Warehouse', start: 4, maxresults: 3 },
      { location: 'Main Warehouse', start: 7, maxresults: 3 },
    ])
    expect(new Set(requests.map((r) => r.path))).toEqual(new Set(['/item', '/location/9']))
  })

  it('refuses a location id SOS does not know, before listing any item', async () => {
    tables['/item'] = items(7)
    tables['/location'] = [{ id: 7, name: 'Back Room' }]
    await expect(newAdapter().listStockLevels(creds, withLocation(1, '8'))).rejects.toThrow(
      /location 8 not found/,
    )
    expect(requests.map((r) => r.path)).toEqual(['/location/8'])
  })

  it('refuses a location with no name, rather than list account-wide totals as its own', async () => {
    tables['/item'] = items(7)
    tables['/location'] = [{ id: 7 }]
    await expect(newAdapter().listStockLevels(creds, withLocation(1, '7'))).rejects.toThrow(
      /location 7 has no name/,
    )
    expect(requests.map((r) => r.path)).toEqual(['/location/7'])
  })
})

describe('sos-inventory getStockLevel', () => {
  it('reads the one item it is asked for, and nothing else', async () => {
    tables['/item'] = items(3)
    const level = await newAdapter().getStockLevel(creds, '1002')
    expect(level).toMatchObject({ id: '1002', productId: '1002', quantityOnHand: 2 })
    expect(requests).toEqual([{ path: '/item/1002', params: {} }])
  })
})

/**
 * The same adapter driven by the real SyncWorker, the inventory vertical's own
 * listable resources and a SQLite ResourceStore: the worker's default page of
 * 500 capped by the declared 200, its preference for a reported `hasMore`,
 * and the completeness marker it writes on the last page.
 */
describe('sos-inventory through the real SyncWorker', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sos-inventory-sync-'))
    handle = await openDb({ sqlitePath: join(dir, 'resources.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })

  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  /** One sync job for one connection, run to its end by the worker itself. */
  async function sync() {
    const adapter = newAdapter()
    const worker = new SyncWorker<SosInventoryAdapter>({
      vertical: 'inventory',
      syncStore,
      credentialStore: {
        loadById: () => creds,
        getRow: () => null,
        updateById: () => {},
      } as never,
      registry: {
        get: (slug: string) => (slug === 'sos-inventory' ? adapter : undefined),
      } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: { ensureFresh: async (_a, c) => c },
      listableResources: LISTABLE_RESOURCES,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    })
    const job = await syncStore.create('inventory', 'conn-1', 'sos-inventory', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return (await syncStore.get(job.id))!
  }

  const stored = async (resourceType: string) =>
    (await resourceStore.list<{ id: string }>('inventory', 'sos-inventory', 'conn-1', resourceType))
      .map((r) => r.id)
      .sort()
  const complete = (resourceType: string) =>
    resourceStore.collectionCompletedAt('inventory', 'sos-inventory', 'conn-1', resourceType)

  const RESOURCES = [
    { resourceType: 'products', ids: (n: number) => range(n).map((i) => String(1000 + i)) },
    { resourceType: 'stock-levels', ids: (n: number) => range(n).map((i) => String(1000 + i)) },
    { resourceType: 'locations', ids: (n: number) => range(n).map(String) },
  ]

  it('stores every row once at 200 a request, and marks each collection complete', async () => {
    const N = 2 * DOCUMENTED_MAX + 1
    tables['/item'] = items(N)
    tables['/location'] = locations(N)
    const job = await sync()
    expect(job.status).toBe('completed')
    expect(new Set(requests.map((r) => r.params['maxresults']))).toEqual(new Set([DOCUMENTED_MAX]))
    expect(startsOn('/location')).toEqual([1, 201, 401])
    // products, then stock levels, each from GET /item
    expect(startsOn('/item')).toEqual([1, 201, 401, 1, 201, 401])
    for (const { resourceType, ids } of RESOURCES) {
      expect(await stored(resourceType)).toEqual(ids(N).sort())
      expect(await complete(resourceType)).not.toBeNull()
    }
  })

  it('ends on a full last page without an empty request', async () => {
    const N = 2 * DOCUMENTED_MAX
    tables['/item'] = items(N)
    tables['/location'] = locations(N)
    const job = await sync()
    expect(job.status).toBe('completed')
    expect(startsOn('/location')).toEqual([1, 201])
    expect(startsOn('/item')).toEqual([1, 201, 1, 201])
    for (const { resourceType, ids } of RESOURCES) {
      expect(await stored(resourceType)).toEqual(ids(N).sort())
      expect(await complete(resourceType)).not.toBeNull()
    }
  })

  it('keeps going past full pages when the envelope has no totalCount', async () => {
    const N = 2 * DOCUMENTED_MAX
    tables['/item'] = items(N)
    tables['/location'] = locations(N)
    envelope.totalCount = 'absent'
    const job = await sync()
    expect(job.status).toBe('completed')
    // No total to end on: the short (empty) third page is the end.
    expect(startsOn('/location')).toEqual([1, 201, 401])
    expect(startsOn('/item')).toEqual([1, 201, 401, 1, 201, 401])
    for (const { resourceType, ids } of RESOURCES) {
      expect(await stored(resourceType)).toEqual(ids(N).sort())
      expect(await complete(resourceType)).not.toBeNull()
    }
  })
})
