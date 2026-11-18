/**
 * SKULabs paging for the two list methods whose endpoints do not paginate:
 * listStockTransfers (GET /transfer_order/get_all) and listStockAdjustments
 * (GET /inventory/get_history). The adapter fetches the whole date window and
 * slices it into the caller's pages.
 *
 * SKULabs' own API reference documents exactly these query parameters, and
 * the first-party route definition (https://api.skulabs.com/definition) lists
 * the same ones:
 *   - GET /transfer_order/get_all: `start` and `end`, both required ("Start
 *     date/time filter for log entries"). 200: "Array of transfer orders within
 *     the date range (items excluded)".
 *     https://skulabs.mintlify.app/api-docs/transfer-order/get-all.md
 *   - GET /inventory/get_history: `start` and `end` (required, format: date)
 *     and an optional `notes` text filter. 200: `rows`, "Array of inventory
 *     change log rows".
 *     https://skulabs.mintlify.app/api-docs/inventory/get-history.md
 * Neither endpoint takes limit, skip, page or cursor, and SKULabs documents no
 * adapter-wide maximum page size, so the adapter declares none.
 *
 * Before the fix the adapter sliced by hand without reporting the total or the
 * end, so the sync worker guessed the end from a short page, the API path
 * published `hasMore: null` on every full page, and a call with no limit got
 * 50 rows instead of the collection.
 *
 * The fixtures are deliberately uneven. Every status, log shape, change type,
 * location and user varies from row to row, one item has many history rows,
 * the row times run from just after the window opens to just before NOW, and
 * the store holds one row just outside each bound. Uniform rows let an adapter
 * that drops rows before paging ("hide cancelled", "one row per item", a
 * client-side date cut) pass every test while under-reporting the total a
 * cache marks the collection complete on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { SkulabsAdapter } from '../../../../../../src/verticals/inventory/adapters/skulabs/index'
import { StockTransferSchema } from '../../../../../../src/verticals/inventory/schema/stock-transfer'
import { StockAdjustmentSchema } from '../../../../../../src/verticals/inventory/schema/stock-adjustment'

const CREDS = { accessToken: 'skulabs_test' }
/**
 * No case here needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of running the worker out of
 * memory.
 */
const CALL_BUDGET = 20
/** Frozen so the date window the adapter sends is the same on every page. */
const NOW = new Date('2026-09-23T12:00:00.000Z')
const SECOND = 1000
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

const adapter = () => new SkulabsAdapter()
/** The adapter as the inventory routers hand it to parseListQuery. */
const routed = (): InventoryAdapter => adapter()

/** A row as the fake upstream holds it. */
interface Stored {
  /** What the endpoint returns for it. */
  row: Record<string, unknown>
  /** The instant the endpoint's start/end filter reads, in epoch ms. */
  at: number
  /** Set by construction, not by the fake's filter: is it inside the window? */
  inside: boolean
}

interface Collection {
  name: string
  path: string
  /** The query the adapter must send on every page, at NOW. */
  window: Record<string, string>
  /** Parameters the endpoint documents; anything else is refused. */
  documented: readonly string[]
  required: readonly string[]
  /** How the endpoint documents `start` and `end`. */
  bound: RegExp
  /** `n` rows inside the window, plus one just outside each bound. */
  store: (n: number) => Stored[]
  /** The canonical id of a returned row, worked out here, not by the adapter. */
  idOf: (row: Record<string, unknown>) => string
  emptyKey: string
  call: (params: QueryParams) => Promise<Array<{ id: string }>>
  parse: (row: unknown) => unknown
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `n` distinct instants, evenly spread from one second after `from` to one second before NOW. */
function spread(from: number, n: number): number[] {
  const first = from + SECOND
  const last = NOW.getTime() - SECOND
  if (n === 1) return [first]
  return Array.from({ length: n }, (_, i) => first + Math.round((i * (last - first)) / (n - 1)))
}

/** Mix the two out-of-window rows in among the rest, so the filter drops them mid-list. */
function withOutsiders(inside: Stored[], before: Stored, after: Stored): Stored[] {
  const out = [...inside]
  out.splice(Math.floor(out.length / 3), 0, before)
  out.splice(Math.floor((2 * out.length) / 3), 0, after)
  return out
}

// Trailing 90 days, sent as ISO date-times.
const TRANSFERS_FROM = Date.parse('2026-06-25T12:00:00.000Z')
const TRANSFERS_TO = NOW.getTime()
const TRANSFER_STATUSES = ['created', 'processing', 'transit', 'closed', 'cancelled'] as const

function transfer(id: string, i: number, at: number): Record<string, unknown> {
  const row: Record<string, unknown> = {
    _id: id,
    number: i + 1,
    source_warehouse_id: i % 2 ? 'wh-b' : 'wh-a',
    destination_warehouse_id: i % 2 ? 'wh-a' : 'wh-b',
    status: TRANSFER_STATUSES[i % TRANSFER_STATUSES.length],
  }
  // The endpoint selects on log-entry time, but its list rows promise no log
  // (they already leave out `items`). So some rows carry one entry, some an
  // older one as well, some an empty log and some none at all.
  if (i % 4 === 0) row['log'] = [{ action: 'created', time: iso(at) }]
  if (i % 4 === 1) {
    row['log'] = [
      { action: 'created', time: iso(at - 120 * DAY) },
      { action: 'transit', time: iso(at) },
    ]
  }
  if (i % 4 === 2) row['log'] = []
  return row
}

const TRANSFERS: Collection = {
  name: 'listStockTransfers',
  path: '/transfer_order/get_all',
  window: { start: iso(TRANSFERS_FROM), end: iso(TRANSFERS_TO) },
  documented: ['start', 'end'],
  required: ['start', 'end'],
  bound: ISO_DATE_TIME,
  store: (n) =>
    withOutsiders(
      spread(TRANSFERS_FROM, n).map((at, i) => ({
        row: transfer(`to${i + 1}`, i, at),
        at,
        inside: true,
      })),
      {
        row: transfer('to-before-window', 3, TRANSFERS_FROM - SECOND),
        at: TRANSFERS_FROM - SECOND,
        inside: false,
      },
      {
        row: transfer('to-after-window', 0, TRANSFERS_TO + SECOND),
        at: TRANSFERS_TO + SECOND,
        inside: false,
      },
    ),
  idOf: (row) => row['_id'] as string,
  emptyKey: 'transfer_orders',
  call: (params) => adapter().listStockTransfers(CREDS, params),
  parse: (row) => StockTransferSchema.parse(row),
}

// Trailing 30 days, sent as dates (the endpoint's `format: date`): the window
// opens at midnight on the start date and runs through the whole end date.
const HISTORY_FROM = Date.parse('2026-08-24T00:00:00.000Z')
const HISTORY_TO = Date.parse('2026-09-24T00:00:00.000Z')
const CHANGE_TYPES = ['increase', 'decrease', 'update'] as const
const CHANGE_NOTES = ['restock', 'damaged in transit', 'cycle count'] as const

function historyRow(item: string, i: number, at: number): Record<string, unknown> {
  return {
    user_id: i % 4 === 3 ? null : `user-${(i % 2) + 1}`,
    item_id: item,
    location_id: `loc-${(i % 2) + 1}`,
    change: {
      type: CHANGE_TYPES[Math.floor(i / 2) % CHANGE_TYPES.length],
      quantity: i + 1,
      notes: CHANGE_NOTES[i % CHANGE_NOTES.length],
    },
    time: iso(at),
    old_value: i,
    sku: `SKU-${item}`,
  }
}

const ADJUSTMENTS: Collection = {
  name: 'listStockAdjustments',
  path: '/inventory/get_history',
  window: { start: '2026-08-24', end: '2026-09-23' },
  documented: ['start', 'end', 'notes'],
  required: ['start', 'end'],
  bound: ISO_DATE,
  store: (n) =>
    withOutsiders(
      // Three items, each changed many times: one item's history is many rows.
      spread(HISTORY_FROM, n).map((at, i) => ({
        row: historyRow(`item${(i % 3) + 1}`, i, at),
        at,
        inside: true,
      })),
      {
        row: historyRow('item1', 0, HISTORY_FROM - SECOND),
        at: HISTORY_FROM - SECOND,
        inside: false,
      },
      {
        row: historyRow('item2', 1, HISTORY_TO + SECOND),
        at: HISTORY_TO + SECOND,
        inside: false,
      },
    ),
  idOf: (row) => `${String(row['item_id'])}:${String(row['location_id'])}:${String(row['time'])}`,
  emptyKey: 'rows',
  call: (params) => adapter().listStockAdjustments(CREDS, params),
  parse: (row) => StockAdjustmentSchema.parse(row),
}

/**
 * A fake SKULabs that honours ONLY what the reference documents for `c.path`:
 * `start` and `end` are required and bound the window, any undocumented
 * parameter (limit, skip, page, cursor, selector) is refused rather than
 * silently ignored, and every call answers with every stored row inside the
 * window, in store order. `body` replaces the whole response.
 *
 * Returns the ids of the rows inside the window, in order: exactly what a
 * walk over every page must serve.
 */
function fakeSkulabs(c: Collection, total: number, body?: Record<string, unknown>) {
  const stored = c.store(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    if (path !== c.path) throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const key of Object.keys(params)) {
      if (!c.documented.includes(key)) {
        throw new Error(
          `${c.path} documents no \`${key}\` parameter (got ${JSON.stringify(params)})`,
        )
      }
    }
    for (const key of c.required) {
      if (typeof params[key] !== 'string' || !c.bound.test(params[key] as string)) {
        throw new Error(
          `${c.path} requires \`${key}\` as ${c.bound} (got ${JSON.stringify(params[key])})`,
        )
      }
    }
    if (body !== undefined) return { data: body }
    // Serve the rows whose time falls inside [start, end], as documented. A
    // date `end` covers that whole day.
    const from = new Date(params['start'] as string).getTime()
    const to = new Date(params['end'] as string).getTime() + (c.bound === ISO_DATE ? DAY : 0)
    const rows = stored.filter((s) => s.at >= from && s.at < to).map((s) => s.row)
    return { data: { [c.emptyKey]: rows } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  const expected = stored.filter((s) => s.inside).map((s) => c.idOf(s.row))
  return { get, expected }
}

/** Drive the method as the sync worker does: withPageSink({ page, limit }). */
async function walk(c: Collection, limit: number, pages: number) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const totals: (number | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await c.call(params)
    for (const row of rows) c.parse(row)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { seen, hasMore, totals }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('skulabs capabilities', () => {
  it('declares no maxPageSize: SKULabs documents no adapter-wide page maximum', () => {
    expect(declaredPageMax(routed())).toBeUndefined()
  })
})

describe.each([TRANSFERS, ADJUSTMENTS])('skulabs $name paging ($path, unpaginated)', (c) => {
  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    const { expected } = fakeSkulabs(c, N)
    const { seen, hasMore, totals } = await walk(c, L, 3)
    expect(expected).toHaveLength(N)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
  })

  it('every row the window returns is served, whatever its status, log, type, item or time, and none outside it', async () => {
    // One page big enough for the lot: nothing here depends on the slicing.
    const { expected } = fakeSkulabs(c, 24)
    const outside = c
      .store(24)
      .filter((s) => !s.inside)
      .map((s) => c.idOf(s.row))
    const { seen, totals } = await walk(c, 100, 1)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(24)
    expect(outside).toHaveLength(2)
    for (const id of outside) expect(seen).not.toContain(id)
    expect(totals).toEqual([24])
  })

  it('page 2 is page 2: rows L+1..2L, not a repeat of page 1', async () => {
    const { expected } = fakeSkulabs(c, 9)
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await c.call(params)).map((r) => r.id)).toEqual(expected.slice(4, 8))
  })

  it('every page, page 2 included, sends exactly the documented window and no paging parameter', async () => {
    const { get } = fakeSkulabs(c, 9)
    await walk(c, 4, 3)
    expect(get).toHaveBeenCalledTimes(3)
    for (const call of get.mock.calls) {
      expect(call[0]).toBe(c.path)
      expect(call[1]?.params).toEqual(c.window)
    }
  })

  it('reports the rows in the window as totalCount and marks the page as paged locally', async () => {
    // The store holds 11 rows; the 2 just outside the window are not counted.
    fakeSkulabs(c, 9)
    expect(c.store(9)).toHaveLength(11)
    const params = withPageSink({ page: 1, limit: 4 })
    await c.call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    const { expected } = fakeSkulabs(c, 2 * L)
    const { seen, hasMore } = await walk(c, L, 3)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, false, false])
  })

  it('walks every row at the worker limit of 500 (no declared max)', async () => {
    const { expected } = fakeSkulabs(c, 1200)
    const { seen, hasMore, totals } = await walk(c, 500, 3)
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([1200, 1200, 1200])
  })

  it('a limit above the router cap (500) is clamped, and every row is still served once', async () => {
    // SKULabs documents no maximum for these endpoints, so the only clamp is
    // parseListQuery's.
    const { expected } = fakeSkulabs(c, 1001)
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '100000' }, routed())
      expect(params.limit).toBe(500)
      const env = listPage(await c.call(params), params, 'skulabs')
      expect(env.meta.limit).toBe(500)
      seen.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    const { expected } = fakeSkulabs(c, 15)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, routed())
      expect(params.limit).toBe(7)
      seen.push(...(await c.call(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    const { expected } = fakeSkulabs(c, 9)
    const p1 = parseListQuery({ page: '1', limit: '4' }, routed())
    const env1 = listPage(await c.call(p1), p1, 'skulabs')
    // listPage derives meta.hasMore from the total, so the adapter's own
    // report is pinned separately: a wrong hasMore beside a right total would
    // otherwise pass here and mislead the sync worker, which prefers it.
    expect(readUpstreamPage(p1)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
    expect(env1.data.map((r) => r.id)).toEqual(expected.slice(0, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, routed())
    const env3 = listPage(await c.call(p3), p3, 'skulabs')
    expect(readUpstreamPage(p3)).toEqual({ totalCount: 9, hasMore: false, pagedLocally: true })
    expect(env3.data.map((r) => r.id)).toEqual(expected.slice(8, 9))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    const { expected } = fakeSkulabs(c, 8)
    const p2 = parseListQuery({ page: '2', limit: '4' }, routed())
    const env2 = listPage(await c.call(p2), p2, 'skulabs')
    expect(readUpstreamPage(p2)).toEqual({ totalCount: 8, hasMore: false, pagedLocally: true })
    expect(env2.data.map((r) => r.id)).toEqual(expected.slice(4, 8))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a direct call with no limit gets every row in the window, not a default page of 50', async () => {
    const { expected } = fakeSkulabs(c, 60)
    expect(expected).toHaveLength(60)
    expect((await c.call({})).map((r) => r.id)).toEqual(expected)
  })

  it('a body with no row array is an empty collection, not a crash', async () => {
    fakeSkulabs(c, 0, {})
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await c.call(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ totalCount: 0, hasMore: false }),
    )
  })
})
