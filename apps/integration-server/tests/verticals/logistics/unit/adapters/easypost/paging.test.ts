import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * EasyPost lists, driven the way the sync worker and the router drive them.
 *
 * Every paginated "retrieve all" endpoint (shipments, trackers, scan_forms,
 * pickups) pages the same way, per docs.easypost.com/docs/pagination: newest
 * first, `page_size` records ("The maximum value is 100, and default is 20."),
 * `has_more` on the envelope, and "If you need to retrieve a successive page
 * when the has_more key is present, make another "retrieve all" request and
 * set the before_id to the ID of the last item returned." There is no page
 * number and no offset. The adapter used to send `page_size` alone, so page 2
 * was page 1 again.
 *
 * `GET /carrier_accounts` is "an unpaginated list of all CarrierAccounts"
 * (docs.easypost.com/docs/carrier-accounts): a bare array, no `has_more`, and
 * no `page_size` parameter to send.
 *
 * The fake below is that contract and nothing more. It honours `page_size`
 * and `before_id` and nothing else, rejects a `page_size` over 100, and keeps
 * one dataset per API key, so a pager position shared across connections
 * shows up as an unknown `before_id`. Two switches break the contract on
 * purpose: `omitHasMore` drops `has_more` from the envelope, and
 * `ignoreBeforeId` answers every request from the newest row.
 */

interface Recorded {
  token: string
  path: string
  query: Record<string, unknown> | undefined
}

const upstream = vi.hoisted(() => ({
  requests: [] as Recorded[],
  data: new Map<string, Map<string, unknown[]>>(),
  omitHasMore: false,
  ignoreBeforeId: false,
  /** The key of every pager walk, as the shared pagers receive it. */
  pagerKeys: [] as string[],
}))

// The real pagers, with the key of every walk recorded.
vi.mock('@opensteward/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opensteward/shared')>()
  return {
    ...actual,
    pageByCursor: ((key, page, fetch) => {
      upstream.pagerKeys.push(key)
      return actual.pageByCursor(key, page, fetch)
    }) as typeof actual.pageByCursor,
    pageByRows: ((key, params, fetch, options) => {
      upstream.pagerKeys.push(key)
      return actual.pageByRows(key, params, fetch, options)
    }) as typeof actual.pageByRows,
  }
})

vi.mock('../../../../../../src/verticals/logistics/adapters/easypost/client', () => {
  const ENVELOPE: Record<string, string> = {
    shipments: 'shipments',
    trackers: 'trackers',
    scan_forms: 'scan_forms',
    pickups: 'pickups',
  }
  return {
    EasyPostClient: class {
      private readonly token: string
      constructor(credentials: { accessToken: string }) {
        this.token = credentials.accessToken
      }
      async get(path: string, query?: Record<string, unknown>): Promise<unknown> {
        upstream.requests.push({ token: this.token, path, query })
        const rows = (upstream.data.get(this.token)?.get(path) ?? []) as Array<{ id: string }>
        if (path === 'carrier_accounts') return rows
        const key = ENVELOPE[path]
        if (!key) throw new Error(`fake EasyPost: no list at ${path}`)
        const raw = query?.['page_size']
        const size = raw === undefined ? 20 : Number(raw)
        if (!Number.isInteger(size) || size < 1 || size > 100) {
          throw Object.assign(new Error(`page_size must be 1..100, got ${String(raw)}`), {
            status: 422,
          })
        }
        let start = 0
        const beforeId = query?.['before_id']
        if (beforeId !== undefined && !upstream.ignoreBeforeId) {
          const at = rows.findIndex((r) => r.id === beforeId)
          if (at < 0) throw new Error(`fake EasyPost: unknown before_id ${String(beforeId)}`)
          start = at + 1
        }
        const page = rows.slice(start, start + size)
        return upstream.omitHasMore
          ? { [key]: page }
          : { [key]: page, has_more: start + size < rows.length }
      }
      async post(): Promise<never> {
        throw new Error('fake EasyPost: no writes in paging tests')
      }
    },
  }
})

import {
  _resetCursorPager,
  CircuitBreaker,
  listPage,
  openDb,
  parseListQuery,
  readUpstreamPage,
  ResourceStore,
  SyncStore,
  SyncWorker,
  withPageSink,
  type DbHandle,
  type QueryParams,
} from '@opensteward/shared'
import { EasyPostAdapter } from '../../../../../../src/verticals/logistics/adapters/easypost'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'
import { LISTABLE_RESOURCES } from '../../../../../../src/verticals/logistics/sync/listable-resources'

const KEY_A = 'EZAK_connection_a'
const KEY_B = 'EZAK_connection_b'
const credsA: Credentials = { accessToken: KEY_A }
const credsB: Credentials = { accessToken: KEY_B }

const adapter = new EasyPostAdapter()

function seed(token: string, path: string, rows: unknown[]): void {
  let byPath = upstream.data.get(token)
  if (!byPath) upstream.data.set(token, (byPath = new Map()))
  byPath.set(path, rows)
}

const stamp = '2025-05-09T20:39:27Z'

function shipment(id: string) {
  return { id, object: 'Shipment', status: 'delivered', created_at: stamp, updated_at: stamp }
}

function scanForm(id: string) {
  return {
    id,
    object: 'ScanForm',
    status: 'created',
    tracking_codes: [],
    created_at: stamp,
    updated_at: stamp,
  }
}

function pickup(id: string) {
  return {
    id,
    object: 'Pickup',
    status: 'scheduled',
    min_datetime: stamp,
    max_datetime: stamp,
    created_at: stamp,
    updated_at: stamp,
  }
}

function carrierAccount(id: string) {
  return { id, object: 'CarrierAccount', type: 'UspsAccount', created_at: stamp, updated_at: stamp }
}

/** A tracker whose events are `${id}#0…` — or, with no details, one summary event named by its code. */
function tracker(id: string, details: number) {
  return {
    id,
    object: 'Tracker',
    tracking_code: `${id}-code`,
    status: 'in_transit',
    carrier: 'USPS',
    shipment_id: null,
    created_at: stamp,
    updated_at: stamp,
    tracking_details: Array.from({ length: details }, (_, i) => ({
      object: 'TrackingDetail',
      message: `${id}#${i}`,
      description: null,
      status: 'in_transit',
      datetime: stamp,
      source: 'USPS',
      carrier_code: null,
      tracking_location: null,
    })),
  }
}

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)

/** A listed row, by the one field these tests read. Canonical ids are optional. */
type Listed = { id?: string }
const idsOf = (rows: Listed[]): Array<string | undefined> => rows.map((r) => r.id)

interface Walk<T> {
  pages: T[][]
  hasMore: Array<boolean | undefined>
  pageSize: Array<number | undefined>
}

/** Pages 1..`pages` at `limit`, as the sync worker asks for them. */
async function walk<T>(
  call: (params: QueryParams) => Promise<T[]>,
  limit: number,
  pages = 3,
): Promise<Walk<T>> {
  const out: Walk<T> = { pages: [], hasMore: [], pageSize: [] }
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    out.pages.push(await call(params))
    const reported = readUpstreamPage(params)
    out.hasMore.push(reported?.hasMore)
    out.pageSize.push(reported?.pageSize)
  }
  return out
}

/** One page, with what the method reported through the sink. */
async function onePage<T>(
  call: (params: QueryParams) => Promise<T[]>,
  params: QueryParams,
): Promise<{ rows: T[]; hasMore: boolean | undefined }> {
  const sunk = withPageSink(params)
  const rows = await call(sunk)
  return { rows, hasMore: readUpstreamPage(sunk)?.hasMore }
}

beforeEach(() => {
  _resetCursorPager()
  upstream.requests.length = 0
  upstream.data.clear()
  upstream.omitHasMore = false
  upstream.ignoreBeforeId = false
  upstream.pagerKeys.length = 0
})

describe('EasyPostAdapter declares the documented page maximum', () => {
  it('declares maxPageSize 100 ("We limit the number of records per page to 100")', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(100)
  })

  it('so the router caps an API limit of 500 at 100', () => {
    expect(parseListQuery({ limit: '500' }, adapter).limit).toBe(100)
  })
})

// ── before_id lists: one upstream page is one caller page ──────────────────

interface BeforeIdList {
  method: string
  path: string
  prefix: string
  make: (id: string) => unknown
  call: (creds: Credentials, p: QueryParams) => Promise<Listed[]>
}

const BEFORE_ID_LISTS: BeforeIdList[] = [
  {
    method: 'listShipments',
    path: 'shipments',
    prefix: 'shp',
    make: shipment,
    call: (creds, p) => adapter.listShipments(creds, p),
  },
  {
    method: 'listManifests',
    path: 'scan_forms',
    prefix: 'sf',
    make: scanForm,
    call: (creds, p) => adapter.listManifests(creds, p),
  },
  {
    method: 'listPickups',
    path: 'pickups',
    prefix: 'pickup',
    make: pickup,
    call: (creds, p) => adapter.listPickups(creds, p),
  },
]

describe.each(BEFORE_ID_LISTS)('$method walks before_id', ({ path, prefix, make, call }) => {
  const L = 3

  it('serves 2L + 1 rows once each over pages 1, 2, 3, reporting has_more', async () => {
    const all = ids(prefix, 2 * L + 1)
    seed(KEY_A, path, all.map(make))

    const w = await walk((p) => call(credsA, p), L)

    expect(w.pages.map(idsOf)).toEqual([all.slice(0, 3), all.slice(3, 6), all.slice(6)])
    expect(w.hasMore).toEqual([true, true, false])
  })

  it('sends page_size = limit, and before_id = the last id of the previous page', async () => {
    const all = ids(prefix, 2 * L + 1)
    seed(KEY_A, path, all.map(make))

    await walk((p) => call(credsA, p), L)

    expect(upstream.requests.map((r) => r.query)).toEqual([
      { page_size: L },
      { page_size: L, before_id: all[L - 1] },
      { page_size: L, before_id: all[2 * L - 1] },
    ])
    expect(upstream.requests.every((r) => r.path === path)).toBe(true)
  })

  it('ends on has_more at N = 2L, and answers page 3 empty without asking again', async () => {
    const all = ids(prefix, 2 * L)
    seed(KEY_A, path, all.map(make))

    const w = await walk((p) => call(credsA, p), L)

    expect(w.pages.map(idsOf)).toEqual([all.slice(0, 3), all.slice(3, 6), []])
    expect(w.hasMore).toEqual([true, false, false])
    expect(upstream.requests).toHaveLength(2)
  })

  it('reads an envelope without has_more as the end, as EasyPost’s own client does', async () => {
    // easypost-python, BaseService._check_has_next_page:
    //   if not collection.get("has_more", False): raise EndOfPaginationError
    upstream.omitHasMore = true
    const all = ids(prefix, 2 * L + 1)
    seed(KEY_A, path, all.map(make))

    const first = await onePage((p) => call(credsA, p), { page: 1, limit: L })

    expect(idsOf(first.rows)).toEqual(all.slice(0, 3))
    expect(first.hasMore).toBe(false)
    expect(upstream.requests).toHaveLength(1)
  })

  it('clamps a limit above 100 to 100, reports that size, and still serves every row', async () => {
    const all = ids(prefix, 201)
    seed(KEY_A, path, all.map(make))

    const w = await walk((p) => call(credsA, p), 250)

    expect(w.pages.flat().map((r) => r.id)).toEqual(all)
    expect(w.pages.map((rows) => rows.length)).toEqual([100, 100, 1])
    expect(w.hasMore).toEqual([true, true, false])
    expect(w.pageSize).toEqual([100, 100, 100])
    for (const r of upstream.requests) expect(r.query?.['page_size']).toBe(100)
  })

  it('pages at the limit parseListQuery delivers, and meta.hasMore follows has_more', async () => {
    const all = ids(prefix, 2 * L + 1)
    seed(KEY_A, path, all.map(make))

    const served: Array<string | undefined> = []
    const hasMore: Array<boolean | null> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ limit: String(L), page }, adapter)
      const env = listPage(await call(credsA, params), params, adapter.platform)
      served.push(...idsOf(env.data))
      hasMore.push(env.meta.hasMore)
      expect(env.meta.limit).toBe(L)
    }
    expect(served).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
  })

  it('a cold jump to page 3 walks the before_id chain from the first page', async () => {
    const all = ids(prefix, 2 * L + 1)
    seed(KEY_A, path, all.map(make))

    const rows = await call(credsA, withPageSink({ page: 3, limit: L }))

    expect(idsOf(rows)).toEqual(all.slice(6))
    expect(upstream.requests.map((r) => r.query?.['before_id'])).toEqual([
      undefined,
      all[L - 1],
      all[2 * L - 1],
    ])
  })

  it('keeps each connection on its own chain', async () => {
    const a = ids(`${prefix}A`, 2 * L + 1)
    const b = ids(`${prefix}B`, 2 * L + 1)
    seed(KEY_A, path, a.map(make))
    seed(KEY_B, path, b.map(make))

    await call(credsA, withPageSink({ page: 1, limit: L }))
    await call(credsB, withPageSink({ page: 1, limit: L }))
    const a2 = await call(credsA, withPageSink({ page: 2, limit: L }))
    const b2 = await call(credsB, withPageSink({ page: 2, limit: L }))

    expect(idsOf(a2)).toEqual(a.slice(3, 6))
    expect(idsOf(b2)).toEqual(b.slice(3, 6))
    const bPage2 = upstream.requests.filter((r) => r.token === KEY_B)[1]
    expect(bPage2?.query).toEqual({ page_size: L, before_id: b[L - 1] })
  })

  it('keeps each page size on its own chain on one connection', async () => {
    // A position is "page N at this size": page 2 at 5 starts after row 5,
    // not after the row that ended page 1 at 3.
    const M = 5
    const all = ids(prefix, 2 * M + 1)
    seed(KEY_A, path, all.map(make))

    await call(credsA, withPageSink({ page: 1, limit: L }))
    await call(credsA, withPageSink({ page: 1, limit: M }))
    const atL = await call(credsA, withPageSink({ page: 2, limit: L }))
    const atM = await call(credsA, withPageSink({ page: 2, limit: M }))

    expect(idsOf(atL)).toEqual(all.slice(L, 2 * L))
    expect(idsOf(atM)).toEqual(all.slice(M, 2 * M))
    expect(upstream.requests.slice(2).map((r) => r.query)).toEqual([
      { page_size: L, before_id: all[L - 1] },
      { page_size: M, before_id: all[M - 1] },
    ])
  })
})

describe('the before_id lists on one connection', () => {
  const L = 3

  it('keep each collection on its own chain', async () => {
    const lists = BEFORE_ID_LISTS.map((list) => {
      const all = ids(list.prefix, 2 * L + 1)
      seed(KEY_A, list.path, all.map(list.make))
      return { ...list, all }
    })

    for (const list of lists) await list.call(credsA, withPageSink({ page: 1, limit: L }))
    for (const list of lists) {
      const before = upstream.requests.length
      const rows = await list.call(credsA, withPageSink({ page: 2, limit: L }))
      expect(idsOf(rows)).toEqual(list.all.slice(L, 2 * L))
      expect(upstream.requests.slice(before)).toEqual([
        { token: KEY_A, path: list.path, query: { page_size: L, before_id: list.all[L - 1] } },
      ])
    }
  })

  it('key every walk by a fingerprint of the connection, never by its API key', async () => {
    for (const creds of [credsA, credsB]) {
      for (const list of BEFORE_ID_LISTS) {
        seed(creds.accessToken, list.path, ids(list.prefix, 2).map(list.make))
      }
      seed(creds.accessToken, 'trackers', [tracker('trk_0001', 1)])
    }
    const keysOf = async (creds: Credentials): Promise<string[]> => {
      const from = upstream.pagerKeys.length
      for (const list of BEFORE_ID_LISTS)
        await list.call(creds, withPageSink({ page: 1, limit: L }))
      await adapter.listTrackingEvents(creds, withPageSink({ page: 1, limit: L }))
      return upstream.pagerKeys.slice(from)
    }

    const a = await keysOf(credsA)
    const b = await keysOf(credsB)

    expect(a).toHaveLength(BEFORE_ID_LISTS.length + 1)
    expect(b).toHaveLength(BEFORE_ID_LISTS.length + 1)
    for (const key of [...a, ...b]) {
      expect(key).toMatch(/^easypost#[0-9a-f]{16}::/)
      expect(key).not.toContain(KEY_A)
      expect(key).not.toContain(KEY_B)
    }
    for (const key of a) expect(b).not.toContain(key)
  })
})

describe('listPickups with an explicit cursor', () => {
  // A direct caller already holding a position (the last id of its previous
  // page) gets the one page after it. The router and the sync worker never
  // send a cursor; they page by number.
  const L = 3

  it('fetches the page after the cursor and reports has_more', async () => {
    const all = ids('pickup', 2 * L + 1)
    seed(KEY_A, 'pickups', all.map(pickup))

    const mid = await onePage((p) => adapter.listPickups(credsA, p), {
      limit: L,
      cursor: all[L - 1],
    })

    expect(idsOf(mid.rows)).toEqual(all.slice(L, 2 * L))
    expect(mid.hasMore).toBe(true)
    expect(upstream.requests.map((r) => r.query)).toEqual([{ page_size: L, before_id: all[L - 1] }])
  })

  it('reports the end when the page after the cursor is the last', async () => {
    const all = ids('pickup', 2 * L + 1)
    seed(KEY_A, 'pickups', all.map(pickup))

    const tail = await onePage((p) => adapter.listPickups(credsA, p), {
      limit: L,
      cursor: all[2 * L - 1],
    })

    expect(idsOf(tail.rows)).toEqual(all.slice(2 * L))
    expect(tail.hasMore).toBe(false)
  })

  it('takes the cursor as the position, whatever page is asked', async () => {
    const all = ids('pickup', 3 * L + 1)
    seed(KEY_A, 'pickups', all.map(pickup))

    const rows = await adapter.listPickups(
      credsA,
      withPageSink({ page: 2, limit: L, cursor: all[L - 1] }),
    )

    expect(idsOf(rows)).toEqual(all.slice(L, 2 * L))
    expect(upstream.requests).toHaveLength(1)
  })
})

// ── trackers: events flattened out of pages of trackers ────────────────────

describe('listTrackingEvents cuts events out of before_id pages of trackers', () => {
  const L = 3
  const eventId = (e: { description?: string; trackingNumber?: string }) =>
    e.description ?? e.trackingNumber

  it('serves 2L + 1 one-event trackers once each, with before_id on the next request', async () => {
    const all = ids('trk', 2 * L + 1)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const w = await walk((p) => adapter.listTrackingEvents(credsA, p), L)

    expect(w.pages.map((rows) => rows.map(eventId))).toEqual([
      all.slice(0, 3).map((id) => `${id}#0`),
      all.slice(3, 6).map((id) => `${id}#0`),
      all.slice(6).map((id) => `${id}#0`),
    ])
    expect(w.hasMore).toEqual([true, true, false])
    expect(upstream.requests.map((r) => r.query)).toEqual([
      { page_size: L },
      { page_size: L, before_id: all[L - 1] },
      { page_size: L, before_id: all[2 * L - 1] },
    ])
  })

  it('serves exactly `limit` events a page when one tracker carries several', async () => {
    // 7 events from 4 trackers: 2 + 1 (summary, no details) + 3 + 1.
    const shape: Array<[string, number]> = [
      ['trk_a', 2],
      ['trk_b', 0],
      ['trk_c', 3],
      ['trk_d', 1],
    ]
    seed(
      KEY_A,
      'trackers',
      shape.map(([id, n]) => tracker(id, n)),
    )
    const events = ['trk_a#0', 'trk_a#1', 'trk_b-code', 'trk_c#0', 'trk_c#1', 'trk_c#2', 'trk_d#0']

    const w = await walk((p) => adapter.listTrackingEvents(credsA, p), L)

    expect(w.pages.map((rows) => rows.map(eventId))).toEqual([
      events.slice(0, 3),
      events.slice(3, 6),
      events.slice(6),
    ])
    expect(w.hasMore).toEqual([true, true, false])
    // The first 3 trackers hold 6 events; the 4th is behind before_id=trk_c.
    expect(upstream.requests.map((r) => r.query)).toEqual([
      { page_size: L },
      { page_size: L, before_id: 'trk_c' },
    ])
  })

  it('ends exactly at N = 2L without a third request', async () => {
    const all = ids('trk', 2 * L)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const w = await walk((p) => adapter.listTrackingEvents(credsA, p), L)

    expect(w.pages.map((rows) => rows.length)).toEqual([3, 3, 0])
    expect(w.hasMore).toEqual([true, false, false])
    expect(upstream.requests).toHaveLength(2)
  })

  it('reads an envelope without has_more as the end, as EasyPost’s own client does', async () => {
    upstream.omitHasMore = true
    const all = ids('trk', 2 * L + 1)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const first = await onePage((p) => adapter.listTrackingEvents(credsA, p), { page: 1, limit: L })

    expect(first.rows.map(eventId)).toEqual(all.slice(0, 3).map((id) => `${id}#0`))
    expect(first.hasMore).toBe(false)
    expect(upstream.requests).toHaveLength(1)
  })

  it('pages at EasyPost’s default of 20 when no limit is given', async () => {
    const all = ids('trk', 25)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const first = await onePage((p) => adapter.listTrackingEvents(credsA, p), { page: 1 })

    expect(first.rows.map(eventId)).toEqual(all.slice(0, 20).map((id) => `${id}#0`))
    expect(first.hasMore).toBe(true)
    expect(upstream.requests[0]?.query).toEqual({ page_size: 20 })
  })

  it('clamps page_size to 100 for a limit above it and still serves every event', async () => {
    const all = ids('trk', 2 * 250 + 1)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const w = await walk((p) => adapter.listTrackingEvents(credsA, p), 250)

    expect(w.pages.flat().map(eventId)).toEqual(all.map((id) => `${id}#0`))
    expect(w.pages.map((rows) => rows.length)).toEqual([250, 250, 1])
    expect(w.hasMore).toEqual([true, true, false])
    for (const r of upstream.requests) expect(r.query?.['page_size']).toBe(100)
  })

  it('pages at the limit parseListQuery delivers, and meta.hasMore is exact', async () => {
    const all = ids('trk', 2 * L + 1)
    seed(
      KEY_A,
      'trackers',
      all.map((id) => tracker(id, 1)),
    )

    const served: Array<string | undefined> = []
    const hasMore: Array<boolean | null> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ limit: String(L), page }, adapter)
      const env = listPage(await adapter.listTrackingEvents(credsA, params), params, 'easypost')
      served.push(...env.data.map(eventId))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(all.map((id) => `${id}#0`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('keeps each connection’s events to that connection', async () => {
    // The row pager keeps the last upstream page's ROWS to serve the next
    // caller page. Shared between connections, B's rows would be A's page 2.
    const a = ids('trkA', 2 * L + 1)
    const b = ids('trkB', 2 * L)
    seed(
      KEY_A,
      'trackers',
      a.map((id) => tracker(id, 1)),
    )
    seed(
      KEY_B,
      'trackers',
      b.map((id) => tracker(id, 1)),
    )
    const list = (creds: Credentials, page: number) =>
      onePage((p) => adapter.listTrackingEvents(creds, p), { page, limit: L })

    await list(credsA, 1)
    await list(credsB, 1)
    const a2 = await list(credsA, 2)
    const b2 = await list(credsB, 2)

    expect(a2.rows.map(eventId)).toEqual(a.slice(3, 6).map((id) => `${id}#0`))
    expect(a2.hasMore).toBe(true)
    expect(b2.rows.map(eventId)).toEqual(b.slice(3, 6).map((id) => `${id}#0`))
    expect(b2.hasMore).toBe(false)
    for (const [token, chain] of [
      [KEY_A, a],
      [KEY_B, b],
    ] as const) {
      const mine = upstream.requests.filter((r) => r.token === token)
      expect(mine.map((r) => r.query?.['before_id'])).toEqual(
        token === KEY_A ? [undefined, chain[L - 1], chain[2 * L - 1]] : [undefined, chain[L - 1]],
      )
    }
  })

  it('fails fast on an upstream that ignores before_id, naming the connection by fingerprint', async () => {
    upstream.ignoreBeforeId = true
    seed(
      KEY_A,
      'trackers',
      ids('trk', 2 * L + 1).map((id) => tracker(id, 1)),
    )

    const failure = await adapter
      .listTrackingEvents(credsA, withPageSink({ page: 1, limit: L }))
      .then(
        () => null,
        (err: unknown) => err,
      )

    expect(failure).toBeInstanceOf(Error)
    const message = (failure as Error).message
    expect(message).toMatch(/names itself as the next page/)
    expect(message).toMatch(/easypost#[0-9a-f]{16}::trackers#events/)
    expect(message).not.toContain(KEY_A)
    expect(upstream.requests).toHaveLength(2)
  })
})

// ── carrier accounts: one unpaginated array ────────────────────────────────

describe('listCarriers slices the unpaginated carrier_accounts list', () => {
  const L = 3

  it('serves 2L + 1 accounts once each over pages 1, 2, 3, with the total', async () => {
    const all = ids('ca', 2 * L + 1)
    seed(KEY_A, 'carrier_accounts', all.map(carrierAccount))

    const params: QueryParams[] = []
    const w = await walk((p) => {
      params.push(p)
      return adapter.listCarriers(credsA, p)
    }, L)

    expect(w.pages.map(idsOf)).toEqual([all.slice(0, 3), all.slice(3, 6), all.slice(6)])
    expect(w.hasMore).toEqual([true, true, false])
    for (const p of params) expect(readUpstreamPage(p)?.totalCount).toBe(2 * L + 1)
  })

  it('sends no page_size: the endpoint takes none', async () => {
    seed(KEY_A, 'carrier_accounts', ids('ca', 2).map(carrierAccount))
    await adapter.listCarriers(credsA, withPageSink({ page: 1, limit: L }))
    expect(upstream.requests).toEqual([
      { token: KEY_A, path: 'carrier_accounts', query: undefined },
    ])
  })

  it('ends at N = 2L', async () => {
    const all = ids('ca', 2 * L)
    seed(KEY_A, 'carrier_accounts', all.map(carrierAccount))

    const w = await walk((p) => adapter.listCarriers(credsA, p), L)

    expect(w.pages.map((rows) => rows.length)).toEqual([3, 3, 0])
    expect(w.hasMore).toEqual([true, false, false])
  })

  it('serves every account past 100 at the capped API limit', async () => {
    const all = ids('ca', 2 * 100 + 1)
    seed(KEY_A, 'carrier_accounts', all.map(carrierAccount))

    const served: Array<string | undefined> = []
    const hasMore: Array<boolean | null> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ limit: '500', page }, adapter)
      const env = listPage(await adapter.listCarriers(credsA, params), params, 'easypost')
      served.push(...idsOf(env.data))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
  })
})

// ── the real sync worker, at the declared max, into a real store ───────────

describe('a sync of an EasyPost connection', () => {
  const CONNECTION_ID = 'conn-easypost'
  const N = 201
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-easypost-sync-'))
    handle = await openDb({ sqlitePath: join(dir, 'resources.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })

  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('stores every listable collection whole and marks it complete, tracking events included', async () => {
    seed(KEY_A, 'shipments', ids('shp', N).map(shipment))
    seed(KEY_A, 'scan_forms', ids('sf', N).map(scanForm))
    seed(KEY_A, 'carrier_accounts', ids('ca', N).map(carrierAccount))
    // 0, 1 or 2 details each: 1, 1 or 2 events, so pages of 100 events cut
    // across trackers.
    const trackers = ids('trk', N).map((id, i) => tracker(id, i % 3))
    seed(KEY_A, 'trackers', trackers)
    const events = trackers.reduce((n, t) => n + Math.max(1, t.tracking_details.length), 0)

    const worker = new SyncWorker<EasyPostAdapter>({
      vertical: 'logistics',
      syncStore,
      credentialStore: { loadById: () => credsA } as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: { ensureFresh: async (_a, c) => c },
      listableResources: LISTABLE_RESOURCES,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const job = await syncStore.create('logistics', CONNECTION_ID, 'easypost', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)

    const done = await syncStore.get(job.id)
    expect(done?.status).toBe('completed')
    const expected: Record<string, number> = {
      shipments: N,
      manifests: N,
      carriers: N,
      trackingevents: events,
    }
    for (const [resourceType, count] of Object.entries(expected)) {
      const rows = await resourceStore.list<{ id: string }>(
        'logistics',
        'easypost',
        CONNECTION_ID,
        resourceType,
      )
      expect(rows, resourceType).toHaveLength(count)
      expect(
        await resourceStore.collectionCompletedAt(
          'logistics',
          'easypost',
          CONNECTION_ID,
          resourceType,
        ),
        resourceType,
      ).not.toBeNull()
    }
    // Every page asked 100 of the paginated endpoints: the declared max.
    for (const r of upstream.requests) {
      if (r.path !== 'carrier_accounts') expect(r.query?.['page_size']).toBe(100)
    }
  })
})
