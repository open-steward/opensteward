/**
 * Loyverse list paging contract.
 *
 * Loyverse's API reference (https://developer.loyverse.com/docs/API-Reference__v1.0.yaml):
 *
 *   "Paginated results include a cursor field as part of the response body. To
 *   fetch the next set of results, send a followup request to the same
 *   endpoint and provide the cursor value returned in the previous response as
 *   a query parameter. When the endpoint sends the final set of results, the
 *   response body will not include a cursor field."
 *
 *   "It is possible to change the number of objects returned in the response.
 *   It can be done by passing the `limit` parameter. Default value is 50 and
 *   maximum is 250."
 *
 * GET /items, /categories, /inventory, /customers and /receipts list `limit`
 * and `cursor`. GET /stores and /discounts list neither and return the whole
 * collection.
 *
 * - products, collections, inventory levels, customers: one upstream page is
 *   one caller page (pageByCursor).
 * - variants (flattened from items) and orders / refunds (SALE / REFUND
 *   receipts split client-side): one upstream page is not one caller page
 *   (pageByRows).
 * - locations and discounts: the whole collection, sliced locally.
 *
 * The fake upstream honours only `limit` and `cursor` on the paginated
 * endpoints, rejects a `limit` outside 1..250 as the real one would, and
 * ignores every parameter on the unpaginated ones.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { LoyverseAdapter } from '../../../../../../src/verticals/ecommerce/adapters/loyverse/index'
import { LoyverseClient } from '../../../../../../src/verticals/ecommerce/adapters/loyverse/client'

const CREDS: Credentials = { accessToken: 'loy-token', refreshToken: 'loy-refresh' }
const MAX = 250
const DEFAULT_LIMIT = 50

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

/** Resource key of each endpoint's response body. */
const KEY: Record<string, string> = {
  items: 'items',
  categories: 'categories',
  inventory: 'inventory_levels',
  customers: 'customers',
  receipts: 'receipts',
  stores: 'stores',
  discounts: 'discounts',
}
const PAGINATED = new Set(['items', 'categories', 'inventory', 'customers', 'receipts'])

function cursorFor(path: string, offset: number): string {
  return Buffer.from(`${path}:${offset}`).toString('base64')
}

function makeServer(data: Partial<Record<string, Raw[]>>) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const rows = data[path]
    if (!rows) throw new Error(`unexpected path in test: ${path}`)
    const key = KEY[path]!
    if (!PAGINATED.has(path)) return { data: { [key]: rows } }

    const limit = params['limit'] === undefined ? DEFAULT_LIMIT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw Object.assign(new Error(`400 limit ${String(params['limit'])}`), {
        response: { status: 400 },
      })
    let start = 0
    const cursor = params['cursor']
    if (cursor !== undefined) {
      const m = /^([^:]+):(\d+)$/.exec(Buffer.from(String(cursor), 'base64').toString())
      if (!m || m[1] !== path)
        throw Object.assign(new Error('400 bad cursor'), { response: { status: 400 } })
      start = Number(m[2])
    }
    const body: Record<string, unknown> = { [key]: rows.slice(start, start + limit) }
    if (start + limit < rows.length) body['cursor'] = cursorFor(path, start + limit)
    return { data: body }
  })
  return { get, calls }
}

function fake(data: Partial<Record<string, Raw[]>>) {
  const server = makeServer(data)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

// ── fixtures ─────────────────────────────────────────────────────────────

function items(n: number): Raw[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${pad(i)}`,
    item_name: `Item ${i}`,
    variants: [],
  }))
}

/** `n` variants spread over items of 1 and 2 variants, in order: 401 need 268 items, past one upstream page. */
function itemsWithVariants(n: number): { items: Raw[]; ids: string[] } {
  const out: Raw[] = []
  const ids: string[] = []
  let v = 0
  for (let i = 0; v < n; i++) {
    const count = Math.min((i % 2) + 1, n - v)
    const variants = Array.from({ length: count }, () => {
      const id = `var-${pad(v++)}`
      ids.push(id)
      return { variant_id: id, item_id: `item-${pad(i)}`, option1_value: 'S' }
    })
    out.push({ id: `item-${pad(i)}`, item_name: `Item ${i}`, option1_name: 'Size', variants })
  }
  return { items: out, ids }
}

/** Receipts that alternate SALE / REFUND, `n` of each. */
function receipts(n: number): { receipts: Raw[]; sales: string[]; refunds: string[] } {
  const out: Raw[] = []
  const sales: string[] = []
  const refunds: string[] = []
  for (let i = 0; i < n; i++) {
    sales.push(`S-${pad(i)}`)
    refunds.push(`R-${pad(i)}`)
    out.push({ receipt_number: `S-${pad(i)}`, receipt_type: 'SALE' })
    out.push({ receipt_number: `R-${pad(i)}`, receipt_type: 'REFUND', refund_for: `S-${pad(i)}` })
  }
  return { receipts: out, sales, refunds }
}

interface Case {
  method:
    | 'listProducts'
    | 'listVariants'
    | 'listCollections'
    | 'listInventoryLevels'
    | 'listCustomers'
    | 'listOrders'
    | 'listRefunds'
    | 'listLocations'
    | 'listDiscounts'
  path: string
  /** Upstream data holding exactly `n` rows of this method, and their ids in order. */
  build: (n: number) => { data: Partial<Record<string, Raw[]>>; ids: string[] }
  kind: 'cursor' | 'rows' | 'local'
}

const simple =
  (path: string, row: (i: number) => Raw, id: (i: number) => string) => (n: number) => ({
    data: { [path]: Array.from({ length: n }, (_, i) => row(i)) },
    ids: Array.from({ length: n }, (_, i) => id(i)),
  })

const CASES: Case[] = [
  {
    method: 'listProducts',
    path: 'items',
    kind: 'cursor',
    build: (n) => ({ data: { items: items(n) }, ids: items(n).map((r) => String(r['id'])) }),
  },
  {
    method: 'listCollections',
    path: 'categories',
    kind: 'cursor',
    build: simple(
      'categories',
      (i) => ({ id: `cat-${pad(i)}`, name: `Cat ${i}` }),
      (i) => `cat-${pad(i)}`,
    ),
  },
  {
    method: 'listInventoryLevels',
    path: 'inventory',
    kind: 'cursor',
    build: simple(
      'inventory',
      (i) => ({ variant_id: `v-${pad(i)}`, store_id: 'st-1', in_stock: 1 }),
      (i) => `v-${pad(i)}:st-1`,
    ),
  },
  {
    method: 'listCustomers',
    path: 'customers',
    kind: 'cursor',
    build: simple(
      'customers',
      (i) => ({ id: `cus-${pad(i)}`, name: `Customer ${i}` }),
      (i) => `cus-${pad(i)}`,
    ),
  },
  {
    method: 'listVariants',
    path: 'items',
    kind: 'rows',
    build: (n) => {
      const { items: data, ids } = itemsWithVariants(n)
      return { data: { items: data }, ids }
    },
  },
  {
    method: 'listOrders',
    path: 'receipts',
    kind: 'rows',
    build: (n) => {
      const r = receipts(n)
      return { data: { receipts: r.receipts }, ids: r.sales }
    },
  },
  {
    method: 'listRefunds',
    path: 'receipts',
    kind: 'rows',
    build: (n) => {
      const r = receipts(n)
      return { data: { receipts: r.receipts }, ids: r.refunds }
    },
  },
  {
    method: 'listLocations',
    path: 'stores',
    kind: 'local',
    build: simple(
      'stores',
      (i) => ({ id: `store-${pad(i)}`, name: `Store ${i}` }),
      (i) => `store-${pad(i)}`,
    ),
  },
  {
    method: 'listDiscounts',
    path: 'discounts',
    kind: 'local',
    build: simple(
      'discounts',
      (i) => ({ id: `disc-${pad(i)}`, name: `Discount ${i}`, type: 'FIXED_PERCENT' }),
      (i) => `disc-${pad(i)}`,
    ),
  },
]

async function list(
  adapter: LoyverseAdapter,
  method: Case['method'],
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Loyverse list paging', () => {
  it('declares the documented maximum page size of 250', () => {
    expect(
      new LoyverseAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' }).capabilities,
    ).toEqual({ maxPageSize: MAX })
  })

  for (const c of CASES) {
    describe(c.method, () => {
      const adapter = () =>
        new LoyverseAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
      // L = 200 makes the row-pager methods cross upstream pages of 250.
      const sizes = c.kind === 'rows' ? [3, 200] : [3, 17]

      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of sizes) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const { data, ids } = c.build(2 * L + 1)
          fake(data)
          const a = adapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      if (c.kind !== 'local') {
        it('the page-2 request carries the documented cursor and limit', async () => {
          const L = c.kind === 'rows' ? 200 : 7
          const { data, ids } = c.build(2 * L + 1)
          const { calls } = fake(data)
          const params = withPageSink({ page: 2, limit: L } as QueryParams)
          expect(await list(adapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
          expect(calls[0]!.params['cursor']).toBeUndefined()
          const sent = c.kind === 'rows' ? MAX : L
          expect(calls.every((x) => x.path === c.path && x.params['limit'] === sent)).toBe(true)
          expect(calls.some((x) => x.params['cursor'] === cursorFor(c.path, sent))).toBe(true)
        })
      } else {
        it('sends neither limit nor cursor, which the endpoint does not document', async () => {
          const { data } = c.build(5)
          const { calls } = fake(data)
          await list(adapter(), c.method, withPageSink({ page: 2, limit: 2 } as QueryParams))
          expect(calls).toHaveLength(1)
          expect(calls[0]!.params['limit']).toBeUndefined()
          expect(calls[0]!.params['cursor']).toBeUndefined()
        })
      }

      it('clamps a limit above 250 and still serves every row', async () => {
        const { data, ids } = c.build(2 * MAX + 1)
        const { calls } = fake(data)
        const a = adapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 500 } as QueryParams)
          const got = await list(a, c.method, params)
          expect(got.length).toBeLessThanOrEqual(500)
          seen.push(...got)
          const meta = readUpstreamPage(params)
          if (c.kind === 'cursor') expect(meta?.pageSize).toBe(MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) {
          if (PAGINATED.has(x.path)) expect(x.params['limit']).toBeLessThanOrEqual(MAX)
        }
        // The router clamps to the declared maximum on the API path.
        expect(parseListQuery({ limit: '5000' }, a).limit).toBe(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const { data, ids } = c.build(25)
        fake(data)
        const a = adapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'loyverse')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'loyverse')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })
    })
  }

  it('two connections never share a walk', async () => {
    const a = makeServer({ receipts: receipts(15).receipts })
    const bData = receipts(15).receipts.map((r) => ({
      ...r,
      receipt_number: `B${String(r['receipt_number'])}`,
    }))
    const b = makeServer({ receipts: bData })
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      headers?: Record<string, string>
    }) => {
      const auth = config?.headers?.['Authorization'] ?? ''
      const server = { 'Bearer token-a': a, 'Bearer token-b': b }[auth]
      if (!server) throw new Error(`no fake account for ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new LoyverseAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
    const ra = await list(
      adapter,
      'listOrders',
      withPageSink({ page: 1, limit: 5 } as QueryParams),
      { accessToken: 'token-a' },
    )
    expect(ra[0]).toBe('S-0001')
    const rb = await list(
      adapter,
      'listOrders',
      withPageSink({ page: 2, limit: 5 } as QueryParams),
      { accessToken: 'token-b' },
    )
    expect(rb).toEqual(['BS-0006', 'BS-0007', 'BS-0008', 'BS-0009', 'BS-0010'])
  })

  it('an explicit upstream cursor is forwarded as one page', async () => {
    const { data, ids } = CASES[0]!.build(30)
    const { calls } = fake(data)
    const adapter = new LoyverseAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
    const params = withPageSink({ limit: 10, cursor: cursorFor('items', 10) } as QueryParams)
    expect(await list(adapter, 'listProducts', params)).toEqual(ids.slice(10, 20))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['cursor']).toBe(cursorFor('items', 10))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

// ── filters and pager keys ───────────────────────────────────────────────

const A = new Date('2026-01-01T00:00:00.000Z')
const B = new Date('2026-02-01T00:00:00.000Z')

/**
 * A fake upstream that honours the filters too: `updated_at_min`, `store_id`
 * and `variant_ids` pick the dataset, and the cursor carries that choice, so
 * a cursor minted under one filter keeps serving that filter's rows. A pager
 * that shares one cursor chain between two filters is then visible.
 */
function fakeFiltered(rowsFor: (tag: string) => Partial<Record<string, Raw[]>>) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const key = KEY[path]!
    let tag = JSON.stringify([
      params['updated_at_min'] ?? null,
      params['store_id'] ?? null,
      params['variant_ids'] ?? null,
    ])
    let start = 0
    if (params['cursor'] !== undefined) {
      ;[tag, start] = JSON.parse(Buffer.from(String(params['cursor']), 'base64').toString()) as [
        string,
        number,
      ]
    }
    const rows = rowsFor(tag)[path]
    if (!rows) throw new Error(`unexpected path in test: ${path}`)
    if (!PAGINATED.has(path)) return { data: { [key]: rows } }
    const limit = params['limit'] === undefined ? DEFAULT_LIMIT : Number(params['limit'])
    const body: Record<string, unknown> = { [key]: rows.slice(start, start + limit) }
    if (start + limit < rows.length)
      body['cursor'] = Buffer.from(JSON.stringify([tag, start + limit])).toString('base64')
    return { data: body }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls }
}

/** A short label for the dataset a filter tag selects. */
function label(tag: string): string {
  const [u, s, v] = JSON.parse(tag) as (string | null)[]
  if (u === A.toISOString()) return 'a'
  if (u === B.toISOString()) return 'b'
  return s ?? v ?? 'all'
}

const prefixed = (tag: string, rows: Raw[], field: string): Raw[] =>
  rows.map((r) => ({ ...r, [field]: `${label(tag)}-${String(r[field])}` }))

describe('Loyverse list filters and pager keys', () => {
  const adapter = () => new LoyverseAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })
  const page = (p: number, extra: Record<string, unknown> = {}) =>
    withPageSink({ page: p, limit: 5, ...extra } as QueryParams)

  it('a cursor walk under one updatedAfter never serves another filter its rows', async () => {
    fakeFiltered((tag) => ({ items: prefixed(tag, items(20), 'id') }))
    const a = adapter()
    expect(await list(a, 'listProducts', page(1, { updatedAfter: A }))).toEqual(
      items(5).map((r) => `a-${String(r['id'])}`),
    )
    expect(await list(a, 'listProducts', page(2, { updatedAfter: B }))).toEqual(
      items(10)
        .slice(5)
        .map((r) => `b-${String(r['id'])}`),
    )
  })

  it('a cursor walk at one limit never serves another limit its positions', async () => {
    const { data, ids } = CASES[0]!.build(30)
    fake(data)
    const a = adapter()
    await list(a, 'listProducts', withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(
      await list(a, 'listProducts', withPageSink({ page: 2, limit: 7 } as QueryParams)),
    ).toEqual(ids.slice(7, 14))
  })

  it('inventory walks are keyed by their store filter', async () => {
    fakeFiltered((tag) => ({
      inventory: Array.from({ length: 20 }, (_, i) => ({
        variant_id: `v-${pad(i)}`,
        store_id: label(tag),
        in_stock: 1,
      })),
    }))
    const a = adapter()
    await list(a, 'listInventoryLevels', page(1, { store_id: 'st-1' }))
    expect(await list(a, 'listInventoryLevels', page(2, { store_id: 'st-2' }))).toEqual(
      Array.from({ length: 5 }, (_, i) => `v-${pad(i + 5)}:st-2`),
    )
  })

  it('a row walk under one updatedAfter never serves another filter its rows', async () => {
    fakeFiltered((tag) => ({ receipts: prefixed(tag, receipts(20).receipts, 'receipt_number') }))
    const a = adapter()
    await list(a, 'listOrders', page(1, { updatedAfter: A }))
    expect(await list(a, 'listOrders', page(2, { updatedAfter: B }))).toEqual(
      receipts(10)
        .sales.slice(5)
        .map((id) => `b-${id}`),
    )
  })

  it('orders and refunds walk the same receipts without sharing rows', async () => {
    const { receipts: data, sales, refunds } = receipts(20)
    fake({ receipts: data })
    const a = adapter()
    // Orders page 1 leaves its upstream page of receipts, cut to orders, in the
    // row pager's slot. Refunds page 2 must not continue from it.
    await list(a, 'listOrders', page(1))
    expect(await list(a, 'listRefunds', page(2))).toEqual(refunds.slice(5, 10))
    expect(await list(a, 'listRefunds', page(1))).toEqual(refunds.slice(0, 5))
    expect(await list(a, 'listOrders', page(2))).toEqual(sales.slice(5, 10))
  })

  describe('updated_at_min goes on the first request only, and only when asked for', () => {
    // Orders walk 250-receipt upstream pages, so page 2 of 100 orders needs a second one.
    for (const [method, path, build, limit] of [
      ['listProducts', 'items', () => ({ items: items(20) }), 3],
      ['listOrders', 'receipts', () => ({ receipts: receipts(200).receipts }), 100],
    ] as const) {
      it(`${method}: with updatedAfter`, async () => {
        const { calls } = fake(build())
        await list(adapter(), method, page(2, { limit, updatedAfter: A }))
        const first = calls.filter((c) => c.params['cursor'] === undefined)
        const rest = calls.filter((c) => c.params['cursor'] !== undefined)
        expect(first.length).toBeGreaterThan(0)
        expect(rest.length).toBeGreaterThan(0)
        for (const c of first) expect(c.params['updated_at_min']).toBe(A.toISOString())
        for (const c of rest) expect(c.params).not.toHaveProperty('updated_at_min')
        expect(calls.every((c) => c.path === path)).toBe(true)
      })

      it(`${method}: without updatedAfter`, async () => {
        const { calls } = fake(build())
        await list(adapter(), method, page(2, { limit }))
        expect(calls.length).toBeGreaterThan(0)
        for (const c of calls) expect(c.params).not.toHaveProperty('updated_at_min')
      })
    }

    it('listInventoryLevels forwards variant_ids and store_id on every request', async () => {
      const { calls } = fake({ inventory: CASES[2]!.build(20).data.inventory! })
      await list(
        adapter(),
        'listInventoryLevels',
        page(3, { limit: 3, variant_ids: 'v-1,v-2', store_id: 'st-1' }),
      )
      expect(calls.length).toBeGreaterThan(1)
      for (const c of calls) {
        expect(c.params['variant_ids']).toBe('v-1,v-2')
        expect(c.params['store_id']).toBe('st-1')
      }
    })

    it('listDiscounts sends the documented updated_at_min', async () => {
      const { calls } = fake({ discounts: CASES[8]!.build(5).data.discounts! })
      await list(adapter(), 'listDiscounts', page(1, { updatedAfter: A }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.params['updated_at_min']).toBe(A.toISOString())
    })
  })

  describe('an explicit upstream cursor on a row method fetches that one page', () => {
    for (const c of CASES.filter((x) => x.kind === 'rows')) {
      it(c.method, async () => {
        const all = c.build(30)
        const { calls } = fake(all.data)
        const raw = all.data[c.path]!.slice(4, 7)
        const expected =
          c.method === 'listVariants'
            ? raw.flatMap((i) => (i['variants'] as Raw[]).map((v) => String(v['variant_id'])))
            : raw
                .filter((r) => (r['receipt_type'] === 'REFUND') === (c.method === 'listRefunds'))
                .map((r) => String(r['receipt_number']))
        expect(expected.length).toBeGreaterThan(0)
        const params = withPageSink({ limit: 3, cursor: cursorFor(c.path, 4) } as QueryParams)
        expect(await list(adapter(), c.method, params)).toEqual(expected)
        expect(calls).toHaveLength(1)
        expect(calls[0]!.params['cursor']).toBe(cursorFor(c.path, 4))
        expect(calls[0]!.params['limit']).toBe(3)
        expect(readUpstreamPage(params)?.hasMore).toBe(true)
      })
    }
  })

  describe('with no limit, the documented default of 50 applies', () => {
    it('listProducts sends limit=50', async () => {
      const { data, ids } = CASES[0]!.build(60)
      const { calls } = fake(data)
      expect(
        await list(adapter(), 'listProducts', withPageSink({ page: 1 } as QueryParams)),
      ).toEqual(ids.slice(0, 50))
      expect(calls[0]!.params['limit']).toBe(DEFAULT_LIMIT)
    })

    it('listOrders serves 50 rows', async () => {
      const { data, ids } = CASES[5]!.build(120)
      fake(data)
      expect(await list(adapter(), 'listOrders', withPageSink({ page: 1 } as QueryParams))).toEqual(
        ids.slice(0, 50),
      )
    })
  })

  it('the client never sends a limit above 250, whatever it is handed', async () => {
    const { calls } = fake({ items: items(5) })
    await new LoyverseClient(CREDS).listWithCursor('items', 'items', { limit: 500 })
    expect(calls[0]!.params['limit']).toBe(MAX)
  })
})
