/**
 * Erplain v2 pages every plural query by `page` and `first`, and says where
 * the collection ends in `paginatorInfo.hasMorePages`.
 *
 * https://erplain.readme.io/v2.0/reference/pagination:
 *   "You can add pagination for your queries by sending the `page` and `first`
 *    parameter to your queries."
 *   | page  | Page number                 | int  | 1             |
 *   | first | Number of results to return | int  | 50 (max: 250) |
 *   | hasMorePages | Are there more pages after this one? | bool |
 *   | total        | Number of total available items.     | int  |
 *
 * https://erplain.readme.io/v2.0/reference/setup: "GraphQL (and therefore our
 * API) only uses **one** endpoint: **<https://api.erplain.app/graphql>**", and
 * the token is a "bearer token" sent as {"Authorization": "Bearer ..."}
 * (/v2.0/reference/introspection).
 *
 * The adapter used to POST to https://app.erplain.com/api/graphql with an
 * X-API-Key header, asking for Relay connections (`products(first, after)`,
 * `nodes`, `pageInfo`) that exist nowhere in the v2 schema, and it never sent
 * the caller's page. The fake below is mounted at axios, the seam the client
 * uses, and answers only the documented root fields with only the documented
 * `first` / `page` / `orderBy` arguments (plus the documented `where` id
 * filter on StockLevels); any other root field or argument is a GraphQL error,
 * as the real schema would return. It returns rows in storage order unless the
 * query sorts by id, and it projects every row onto the query's selection set,
 * so a field the adapter forgets to select is missing from what it reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  declaredPageMax,
  type Credentials,
  type QueryParams,
  type UpstreamPageMeta,
} from '@opensteward/shared'
import { ErplainAdapter } from '../../../../../../src/verticals/inventory/adapters/erplain/index'
import { transformProduct } from '../../../../../../src/verticals/inventory/adapters/erplain/transform/product'
import { transformStockLevel } from '../../../../../../src/verticals/inventory/adapters/erplain/transform/stock-level'
import { transformLocation } from '../../../../../../src/verticals/inventory/adapters/erplain/transform/location'
import { transformSupplier } from '../../../../../../src/verticals/inventory/adapters/erplain/transform/supplier'
import { transformPurchaseOrder } from '../../../../../../src/verticals/inventory/adapters/erplain/transform/purchase-order'
import { ProductSchema } from '../../../../../../src/verticals/inventory/schema/product'
import { StockLevelSchema } from '../../../../../../src/verticals/inventory/schema/stock-level'
import { LocationSchema } from '../../../../../../src/verticals/inventory/schema/location'
import { SupplierSchema } from '../../../../../../src/verticals/inventory/schema/supplier'
import { PurchaseOrderSchema } from '../../../../../../src/verticals/inventory/schema/purchase-order'

type Row = Record<string, unknown>

const DOCUMENTED_MAX = 250
const DOCUMENTED_DEFAULT = 50
const creds = { accessToken: '38|the-token' } as Credentials

const LIST_ROOTS = ['Products', 'StockLevels', 'Locations', 'Suppliers', 'Purchases'] as const
const GET_ROOTS = ['Product', 'Location', 'Supplier', 'Purchase'] as const

const requests: Array<{ root: string; args: string; variables: Row }> = []
let createConfig: Record<string, unknown> | undefined
let tables: Record<string, Row[]> = {}

// ── A minimal GraphQL reader: root field, its arguments, its selection set ──

type Selection = Map<string, Selection | true>

function tokenize(q: string): string[] {
  return q.match(/\$?[A-Za-z_]\w*|-?\d+(?:\.\d+)?|"[^"]*"|[{}()[\]:,!=]/g) ?? []
}

/** Reads `{ a b { c } }` starting at tokens[i] === '{'; returns [selection, next index]. */
function readSelection(t: string[], i: number): [Selection, number] {
  const sel: Selection = new Map()
  i++
  while (t[i] !== '}') {
    const name = t[i++]!
    if (t[i] === '(') {
      let depth = 0
      do {
        if (t[i] === '(') depth++
        if (t[i] === ')') depth--
        i++
      } while (depth > 0)
    }
    if (t[i] === '{') {
      const [sub, next] = readSelection(t, i)
      sel.set(name, sub)
      i = next
    } else sel.set(name, true)
  }
  return [sel, i + 1]
}

function project(value: unknown, sel: Selection | true): unknown {
  if (sel === true || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((v) => project(v, sel))
  const out: Row = {}
  for (const [k, sub] of sel) {
    if (k in (value as Row)) out[k] = project((value as Row)[k], sub)
  }
  return out
}

/** The operation's root field, its raw argument text and its selection set. */
function readRoot(q: string): { root: string; args: string; sel: Selection } {
  const body = q.slice(q.indexOf('{') + 1)
  const m = /^\s*(\w+)\s*\(/.exec(body)
  if (!m) throw new Error(`fake upstream cannot read query: ${q}`)
  let depth = 0
  let end = m[0].length - 1
  do {
    if (body[end] === '(') depth++
    if (body[end] === ')') depth--
    end++
  } while (depth > 0)
  const t = tokenize(body.slice(end))
  return { root: m[1]!, args: body.slice(m[0].length, end - 1), sel: readSelection(t, 0)[0] }
}

/** Top-level `name: value` pairs of an argument list, whitespace-normalised. */
function readArgs(args: string): Record<string, string> {
  const out: Record<string, string> = {}
  let depth = 0
  let start = 0
  const parts: string[] = []
  for (let i = 0; i <= args.length; i++) {
    const c = args[i]
    if (c === '[' || c === '{') depth++
    if (c === ']' || c === '}') depth--
    if ((c === ',' && depth === 0) || i === args.length) {
      parts.push(args.slice(start, i))
      start = i + 1
    }
  }
  for (const part of parts) {
    const k = part.indexOf(':')
    if (k < 0) continue
    out[part.slice(0, k).trim()] = part
      .slice(k + 1)
      .replace(/\s+/g, ' ')
      .trim()
  }
  return out
}

const gqlError = (message: string) => ({ data: { errors: [{ message }] } })
const ORDER_BY_ID = '[{ column: ID, order: ASC }]'
const byId = (a: Row, b: Row) => Number(a['id']) - Number(b['id'])

async function post(_url: string, body: { query: string; variables: Row }) {
  const { root, args, sel } = readRoot(body.query)
  const argMap = readArgs(args)
  requests.push({ root, args, variables: body.variables })

  if ((GET_ROOTS as readonly string[]).includes(root)) {
    if (Object.keys(argMap).join() !== 'id') return gqlError(`bad args ${args}`)
    const row = (tables[`${root}s`] ?? []).find(
      (r) => String(r['id']) === String(body.variables['id']),
    )
    return { data: { data: { [root]: project(row ?? null, sel) } } }
  }
  if (!(LIST_ROOTS as readonly string[]).includes(root)) {
    return gqlError(`Cannot query field "${root}" on type "Query".`)
  }
  for (const a of Object.keys(argMap)) {
    const known = a === 'first' || a === 'page' || a === 'orderBy'
    const stockFilter = a === 'where' && root === 'StockLevels'
    if (!known && !stockFilter) {
      return gqlError(`Unknown argument "${a}" on field "Query.${root}".`)
    }
  }
  if (argMap['orderBy'] !== undefined && argMap['orderBy'] !== ORDER_BY_ID) {
    return gqlError(`fake upstream only sorts by ${ORDER_BY_ID}, got ${argMap['orderBy']}`)
  }
  const vars = (v: string | undefined) => (v?.startsWith('$') ? body.variables[v.slice(1)] : v)
  let rows = [...(tables[root] ?? [])]
  if (argMap['orderBy'] === ORDER_BY_ID) rows.sort(byId)
  const where = vars(argMap['where']) as Row | undefined
  if (where !== undefined) {
    // The documented id filter: { "column": "ID", "operator": "EQ", "value": 200050 }.
    if (
      where['column'] !== 'ID' ||
      where['operator'] !== 'EQ' ||
      typeof where['value'] !== 'number'
    ) {
      return gqlError(
        `fake upstream only filters by the documented id, got ${JSON.stringify(where)}`,
      )
    }
    rows = rows.filter((r) => r['id'] === where['value'])
  }
  const first = Number(vars(argMap['first']) ?? DOCUMENTED_DEFAULT)
  if (first > DOCUMENTED_MAX) return gqlError('first exceeds the maximum of 250')
  const page = Number(vars(argMap['page']) ?? 1)
  const data = rows.slice((page - 1) * first, page * first)
  const lastPage = Math.max(Math.ceil(rows.length / first), 1)
  const paginator = {
    paginatorInfo: {
      count: data.length,
      currentPage: page,
      hasMorePages: page < lastPage,
      total: rows.length,
      lastPage,
      perPage: first,
    },
    data,
  }
  return { data: { data: { [root]: project(paginator, sel) } } }
}

/** Stores rows newest-id-first, so only an id-ordered query reads them ascending. */
function seed(root: string, rows: Row[]) {
  tables[root] = [...rows].reverse()
}

beforeEach(() => {
  requests.length = 0
  tables = {}
  createConfig = undefined
  vi.spyOn(axios, 'create').mockImplementation(((config: Record<string, unknown>) => {
    createConfig = config
    return { post }
  }) as unknown as typeof axios.create)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const ROWS: Record<(typeof LIST_ROOTS)[number], (i: number) => Row> = {
  Products: (i) => ({ id: 1000 + i, label: `Product ${i}`, active: true, sku: `SKU-${i}` }),
  StockLevels: (i) => ({
    id: 2000 + i,
    on_hand: i,
    location: { id: 1, label: 'Main' },
    variant: { id: 5000 + i, sku: `SKU-${i}`, product: { id: 1000 + i } },
  }),
  Locations: (i) => ({ id: 3000 + i, label: `Location ${i}`, active: true, type: 'warehouse' }),
  Suppliers: (i) => ({ id: 4000 + i, label: `Supplier ${i}`, active: true }),
  Purchases: (i) => ({
    id: 6000 + i,
    label: `PO-${i}`,
    status: 'draft',
    supplier: { id: 4001 },
    line_items: [],
  }),
}

/**
 * One row per list root carrying every field its transform reads, with values
 * from the documented examples (see the transform tests). Read back through
 * the projecting fake, the adapter's output equals the transform of the whole
 * row only when the query selects every one of these fields.
 */
const FULL = {
  Products: {
    id: 100050,
    label: 'Tee-Shirt',
    active: false,
    sku: 'TSH-BLUE',
    type: 'Variant',
    description: 'Cotton tee-shirt',
    supplier_description: 'Tee-shirt, 180 gsm',
    country_of_origin: 'FR',
    default_supplier_id: 5001,
    brand: { label: 'Acme Apparel' },
    created_at: '2026-01-15 09:30:00',
    updated_at: '2026-02-01 14:20:00',
  },
  StockLevels: {
    id: 200050,
    on_hand: 25,
    available: 20,
    incoming: 10,
    reserved: 5,
    reorder_point: 8,
    bin_location: 'A1',
    to_reorder: 0,
    location: { id: 100, label: 'Main Warehouse' },
    variant: { id: 5001, sku: 'SKU-RED', product: { id: 100050 } },
  },
  Locations: {
    id: 100001,
    label: 'Main Warehouse',
    active: false,
    type: 'warehouse',
    shipping_cost: 5.5,
    phone: '+33 1 23 45 67 89',
    address: {
      address_1: '10 rue de la Paix',
      address_2: 'Bâtiment B',
      city: 'Paris',
      state: 'Île-de-France',
      postal_code: '75002',
      country: 'FR',
    },
  },
  Suppliers: {
    id: 3001,
    label: 'Acme Suppliers',
    email: 'orders@acme.example',
    phone: '+33 1 00 00 00 00',
    active: false,
    supplier_number: 'SUP-3001',
    currency: { label: 'EUR' },
  },
  Purchases: {
    id: 700001,
    label: 'PO-00042',
    status: 'active',
    delivery_status: 'not_delivered',
    dated_at: '2026-01-15',
    shipping_at: '2026-02-01',
    created_at: '2026-01-15 09:30:00',
    subtotal: 1250.5,
    total: 1500.6,
    location_label: 'Main Warehouse',
    currency: { label: 'EUR' },
    supplier: { id: 100002 },
    line_items: [{ id: 1, quantity: 10, variant: { id: 5001, product: { id: 100050 } } }],
  },
} satisfies Record<(typeof LIST_ROOTS)[number], Row>

const TRANSFORM: Record<(typeof LIST_ROOTS)[number], (raw: never) => unknown> = {
  Products: transformProduct,
  StockLevels: transformStockLevel,
  Locations: transformLocation,
  Suppliers: transformSupplier,
  Purchases: transformPurchaseOrder,
}

const SCHEMA = {
  Products: ProductSchema,
  StockLevels: StockLevelSchema,
  Locations: LocationSchema,
  Suppliers: SupplierSchema,
  Purchases: PurchaseOrderSchema,
} as const

const CASES = [
  { method: 'listProducts', root: 'Products', base: 1000 },
  { method: 'listStockLevels', root: 'StockLevels', base: 2000 },
  { method: 'listLocations', root: 'Locations', base: 3000 },
  { method: 'listSuppliers', root: 'Suppliers', base: 4000 },
  { method: 'listPurchaseOrders', root: 'Purchases', base: 6000 },
] as const

type ListMethod = (typeof CASES)[number]['method']
const call = (a: ErplainAdapter, m: ListMethod, p: QueryParams) =>
  (a[m] as (c: Credentials, p: QueryParams) => Promise<Array<{ id: string }>>).call(a, creds, p)

async function drive(m: ListMethod, limit: number, pages: number) {
  const adapter = new ErplainAdapter()
  const ids: string[] = []
  const reports: Array<UpstreamPageMeta | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    ids.push(...(await call(adapter, m, params)).map((r) => r.id))
    reports.push(readUpstreamPage(params))
  }
  return { ids, reports }
}

it('declares the documented 250-row maximum', () => {
  expect(declaredPageMax(new ErplainAdapter())).toBe(DOCUMENTED_MAX)
})

it('posts to the documented v2 endpoint with a bearer token', async () => {
  seed('Products', range(1).map(ROWS.Products))
  await new ErplainAdapter().listProducts(creds, { page: 1, limit: 10 })
  expect(createConfig?.['baseURL']).toBe('https://api.erplain.app/graphql')
  const headers = createConfig?.['headers'] as Record<string, string>
  expect(headers['Authorization']).toBe('Bearer 38|the-token')
  expect(headers['X-API-Key']).toBeUndefined()
})

describe.each(CASES)('$method', ({ method, root, base }) => {
  it(`queries ${root} with only the documented first/page/orderBy arguments`, async () => {
    seed(root, range(3).map(ROWS[root]))
    await call(new ErplainAdapter(), method, { page: 2, limit: 7 })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.root).toBe(root)
    expect(requests[0]!.variables).toEqual({ first: 7, page: 2 })
    expect(readArgs(requests[0]!.args)['orderBy']).toBe(ORDER_BY_ID)
  })

  it('selects every field its transform reads', async () => {
    seed(root, [FULL[root]])
    const got = await call(new ErplainAdapter(), method, { page: 1, limit: 10 })
    expect(got).toEqual([TRANSFORM[root](FULL[root] as never)])
    expect(() => SCHEMA[root].parse(got[0])).not.toThrow()
  })

  it('walks 2L+1 rows in three pages, every id once, hasMore exact', async () => {
    const L = 4
    seed(root, range(2 * L + 1).map(ROWS[root]))
    const { ids, reports } = await drive(method, L, 3)
    expect(ids).toEqual(range(2 * L + 1).map((i) => String(base + i)))
    expect(new Set(ids).size).toBe(2 * L + 1)
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([9, 9, 9])
    expect(reports.map((r) => r?.currentPage)).toEqual([1, 2, 3])
    expect(reports.every((r) => r?.pageSize === undefined)).toBe(true)
  })

  it('reports hasMore false on an exact multiple of the page size', async () => {
    seed(root, range(8).map(ROWS[root]))
    const { ids, reports } = await drive(method, 4, 2)
    expect(ids).toHaveLength(8)
    expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
  })

  it('clamps a limit above 250 and reports the size it sent', async () => {
    seed(root, range(DOCUMENTED_MAX + 1).map(ROWS[root]))
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await call(new ErplainAdapter(), method, params)
    expect(requests[0]!.variables).toEqual({ first: DOCUMENTED_MAX, page: 1 })
    expect(rows).toHaveLength(DOCUMENTED_MAX)
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: DOCUMENTED_MAX, hasMore: true })
  })

  it('defaults to page 1 and the documented 50 when the caller sends neither', async () => {
    seed(root, range(2).map(ROWS[root]))
    await call(new ErplainAdapter(), method, {})
    expect(requests[0]!.variables).toEqual({ first: DOCUMENTED_DEFAULT, page: 1 })
  })
})

describe('get methods read the documented single-record queries', () => {
  it.each([
    ['getProduct', 'Product', 'Products', 1001],
    ['getLocation', 'Location', 'Locations', 3001],
    ['getSupplier', 'Supplier', 'Suppliers', 4001],
    ['getPurchaseOrder', 'Purchase', 'Purchases', 6001],
  ] as const)('%s queries %s(id)', async (method, root, table, id) => {
    seed(`${root}s`, range(1).map(ROWS[table]))
    const got = await (
      new ErplainAdapter()[method] as (c: Credentials, id: string) => Promise<{ id: string }>
    ).call(new ErplainAdapter(), creds, String(id))
    expect(requests[0]!.root).toBe(root)
    expect(requests[0]!.variables).toEqual({ id: String(id) })
    expect(got.id).toBe(String(id))
  })

  it('a missing record is a 404', async () => {
    await expect(new ErplainAdapter().getProduct(creds, '999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it.each([
    ['getProduct', 'Product', 'Products'],
    ['getLocation', 'Location', 'Locations'],
    ['getSupplier', 'Supplier', 'Suppliers'],
    ['getPurchaseOrder', 'Purchase', 'Purchases'],
  ] as const)('%s selects every field its transform reads', async (method, root, table) => {
    seed(`${root}s`, [FULL[table]])
    const got = await (
      new ErplainAdapter()[method] as (c: Credentials, id: string) => Promise<unknown>
    ).call(new ErplainAdapter(), creds, String(FULL[table].id))
    expect(got).toEqual(TRANSFORM[table](FULL[table] as never))
    expect(() => SCHEMA[table].parse(got)).not.toThrow()
  })

  it('getStockLevel reads one StockLevels row through the documented id filter', async () => {
    seed('StockLevels', [...range(3).map(ROWS.StockLevels), FULL.StockLevels])
    const got = await new ErplainAdapter().getStockLevel(creds, '200050')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.root).toBe('StockLevels')
    expect(requests[0]!.variables).toEqual({
      where: { column: 'ID', operator: 'EQ', value: 200050 },
    })
    expect(got).toEqual(transformStockLevel(FULL.StockLevels))
    expect(() => StockLevelSchema.parse(got)).not.toThrow()
  })

  it('getStockLevel is a 404 when the filter matches nothing', async () => {
    seed('StockLevels', range(3).map(ROWS.StockLevels))
    await expect(new ErplainAdapter().getStockLevel(creds, '999')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getStockLevel is a 404 without a request for an id that is not an Int', async () => {
    await expect(new ErplainAdapter().getStockLevel(creds, 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(requests).toHaveLength(0)
  })
})
