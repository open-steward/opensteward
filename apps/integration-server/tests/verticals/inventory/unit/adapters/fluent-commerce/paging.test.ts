/**
 * Fluent Commerce lists page through GraphQL connections by cursor.
 *
 * The three list queries, as Fluent documents them
 * (https://docs.fluentcommerce.com/by-type/bulk-extracts-with-graphql):
 *
 *   "variantProducts (after:$after, first:$first)"
 *   "inventoryPositions(after:$after, first:$first)"
 *   "locations (after:$after, first:$first)"
 *
 * each selecting `edges { node { … } cursor }` and `pageInfo { hasNextPage }`.
 * The same page's script reads `data[entity]['pageInfo']['hasNextPage']` and
 * takes the next `after` from the last edge's `cursor` (`get_cursor`). The
 * schema reference's PageInfo
 * (https://api.production.shared-sydney-01.fluentcommerce.com/graphql/docs/object/pageinfo/)
 * has only `hasPreviousPage` and `hasNextPage`: there is no `endCursor`.
 *
 * The page size, from https://docs.fluentcommerce.com/essential-knowledge/graphql-operations:
 *
 *   "The query will only return the first 10 records if these arguments are
 *   not provided. Values of first and last must be within 1 - 5,000. If the
 *   value exceeds 5000, it is replaced by 5000."
 *
 * The adapter used to read `after` from `params.cursor`, which neither the
 * router nor the sync worker ever sets, so page 2 re-sent page 1's request and
 * got page 1 again. It also selected `pageInfo { endCursor }`, which Fluent's
 * schema does not have.
 *
 * The nested `quantities` connection follows the same default, from
 * https://docs.fluentcommerce.com/essential-knowledge/graphql-query-limits:
 *
 *   "Clients can supply a first or last argument on any connection. If the
 *   first and last are not provided, the default argument is the first 10."
 *
 * and its `type [String!]` argument takes several values, any of which
 * matches (https://docs.fluentcommerce.com/essential-knowledge/graphql-queries):
 *
 *   "Queries can also be refined by passing multiple values for a given
 *   field. These can be specified in an array."
 *
 * The fake below honours ONLY what is documented: `first` (absent → 10, above
 * 5000 → 5000, not a whole number ≥ 1 → refused) and `after` (the cursor of
 * the edge to start after) on the list, `first` and `type` on the nested
 * quantities, and it refuses a selection outside the documented types the
 * way GraphQL validation does. It refuses nested arguments it does not
 * model rather than ignore them. Like any GraphQL server it answers
 * only the fields a query selects: a query that forgets `cursor` on its edges,
 * or `type` on a quantity, gets no such field back. Cursors belong to one
 * collection — the schema's `after` is "the specified global ID", an id in
 * that entity's space — so the fake refuses another collection's cursor
 * rather than guess what a real tenant would do with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { FluentCommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/fluent-commerce/index'

type Field = 'variantProducts' | 'inventoryPositions' | 'locations'
type Method = 'listProducts' | 'listStockLevels' | 'listLocations'

const FIELDS: readonly Field[] = ['variantProducts', 'inventoryPositions', 'locations']

/** Documented maximum of `first` and `last` on a search query. */
const DOC_MAX = 5000
/** What a search query returns when given no `first` or `last`. */
const DOC_DEFAULT = 10

const CREDS: Credentials = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  extra: { accountId: 'ACME', env: 'production' },
}

interface Seen {
  field: Field
  query: string
  variables: Record<string, unknown>
  authorization: string | undefined
}

interface GraphQLBody {
  query: string
  variables?: Record<string, unknown>
}

function pad(i: number): string {
  return String(i).padStart(5, '0')
}

/** An opaque cursor, as Fluent mints them: the caller never reads its contents. */
function cursorOf(field: Field, i: number): string {
  return Buffer.from(`${field}:${i}`).toString('base64')
}

/** The edge a cursor names, or undefined when it is not one of `field`'s. */
function indexOfCursor(field: Field, cursor: string): number | undefined {
  const m = /^(\w+):(\d+)$/.exec(Buffer.from(cursor, 'base64').toString('utf8'))
  return m && m[1] === field ? Number(m[2]) : undefined
}

/** A selection set: field name → its sub-selection, or null for a leaf. */
type Selection = Map<string, Selection | null>

/**
 * The selection set of a query, argument lists dropped. Enough GraphQL for
 * the adapter's queries: fields and nested selections. The adapter uses no
 * aliases or fragments, and the fake refuses them rather than misread them.
 */
function selectionOf(query: string): Selection {
  let text = ''
  let depth = 0
  for (const ch of query) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0) text += ch
  }
  const tokens: string[] = text.match(/[A-Za-z_]\w*|[{}]|\.\.\.|:/g) ?? []
  let i = tokens.indexOf('{')
  const block = (): Selection => {
    const sel: Selection = new Map()
    i++
    while (tokens[i] !== '}') {
      const name = tokens[i++]
      if (name === undefined || name === ':' || name === '...' || tokens[i] === ':') {
        throw new Error(`the fake does not model aliases or fragments: ${query}`)
      }
      sel.set(name, tokens[i] === '{' ? block() : null)
    }
    i++
    return sel
  }
  return block()
}

/** What a GraphQL server returns for `value` under `sel`: only what was selected. */
function project(value: unknown, sel: Selection | null): unknown {
  if (sel === null || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((v) => project(v, sel))
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [name, child] of sel) if (name in obj) out[name] = project(obj[name], child)
  return out
}

const PREFIX: Record<Field, string> = {
  variantProducts: 'SKU',
  inventoryPositions: 'POS',
  locations: 'LOC',
}

interface QuantityRecord {
  ref: string
  type: string
  quantity: number
}

/** What an inventory position holds upstream, before a query's arguments cut it. */
interface PositionData {
  onHand: number | null
  quantities: QuantityRecord[]
}

function node(field: Field, i: number, position?: PositionData): Record<string, unknown> {
  const ref = `${PREFIX[field]}-${pad(i + 1)}`
  switch (field) {
    case 'variantProducts':
      return { ref, name: `Product ${i + 1}`, status: 'ACTIVE' }
    case 'inventoryPositions': {
      const p = position ?? {
        onHand: 10,
        quantities: [{ ref: `Q-${pad(i + 1)}`, type: 'RESERVED', quantity: 3 }],
      }
      return {
        ref,
        productRef: `SKU-${pad(i + 1)}`,
        locationRef: 'LOC-00001',
        onHand: p.onHand,
        status: 'ACTIVE',
        quantities: { edges: p.quantities.map((q) => ({ node: q })) },
      }
    }
    case 'locations':
      return { id: String(i + 1), ref, name: `Location ${i + 1}`, status: 'ACTIVE' }
  }
}

/** `count` records of `type`, each holding `quantity`. */
function records(type: string, count: number, quantity: number): QuantityRecord[] {
  return Array.from({ length: count }, (_, i) => ({ ref: `${type}-${i + 1}`, type, quantity }))
}

interface QuantitiesArgs {
  first: number
  types: string[] | undefined
}

const TYPE_ARG = /\btype\s*:\s*(\[[^\]]*\]|"[^"]*")/
const FIRST_ARG = /\bfirst\s*:\s*(\d+)/

/**
 * The arguments a query gives `quantities`, or undefined when it selects none.
 * Only literal `first` and `type` are modelled; anything else is refused.
 */
function quantitiesArgs(query: string): QuantitiesArgs | undefined {
  const m = /\bquantities\s*(?:\(([^)]*)\))?\s*\{/.exec(query)
  if (!m) return undefined
  const args = m[1] ?? ''
  const rest = args.replace(TYPE_ARG, '').replace(FIRST_ARG, '').replace(/[\s,]/g, '')
  if (rest !== '') throw new Error(`the fake does not model quantities arguments: ${args}`)
  const first = FIRST_ARG.exec(args)
  const type = TYPE_ARG.exec(args)
  return {
    first: first ? Math.min(Number(first[1]), DOC_MAX) : DOC_DEFAULT,
    types: type ? [...type[1]!.matchAll(/"([^"]*)"/g)].map((t) => t[1]!) : undefined,
  }
}

/** A position's quantities as Fluent serves them under `args`: filtered by type, then cut at `first`. */
function serveQuantities(
  position: Record<string, unknown>,
  args: QuantitiesArgs,
): Record<string, unknown> {
  const { edges } = position['quantities'] as { edges: Array<{ node: QuantityRecord }> }
  const kept = edges.filter((e) => args.types === undefined || args.types.includes(e.node.type))
  return { ...position, quantities: { edges: kept.slice(0, args.first) } }
}

function ids(field: Field, start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${PREFIX[field]}-${pad(start + i)}`)
}

/** GraphQL's answer to a selection outside the schema. */
function validationError(message: string) {
  return { data: { errors: [{ message }] } }
}

/**
 * A fake Fluent GraphQL endpoint at the axios seam the client uses, serving
 * `n` rows of every list connection in a fixed order. Every inventory
 * position holds `position` when it is given.
 */
function fakeFluent(n: number, position?: PositionData) {
  const seen: Seen[] = []
  let authorization: string | undefined
  const post = vi.fn(async (_path: string, body: GraphQLBody) => {
    const vars = body.variables ?? {}

    // PageInfo has only hasPreviousPage and hasNextPage.
    for (const m of body.query.matchAll(/pageInfo\s*\{([^}]*)\}/g)) {
      const bad = m[1]!
        .trim()
        .split(/\s+/)
        .find((f) => f && f !== 'hasNextPage' && f !== 'hasPreviousPage')
      if (bad)
        return validationError(`Validation error: Field '${bad}' in type 'PageInfo' is undefined`)
    }
    // InventoryPosition.quantities is an InventoryQuantityConnection.
    if (
      /\bquantities\b/.test(body.query) &&
      !/quantities\s*(?:\([^)]*\))?\s*\{\s*edges\s*\{\s*node\s*\{/.test(body.query)
    ) {
      return validationError(
        "Validation error: Field 'quantity' in type 'InventoryQuantityConnection' is undefined",
      )
    }

    const selection = selectionOf(body.query)
    const nested = quantitiesArgs(body.query)
    const serve = (row: Record<string, unknown>) =>
      nested && 'quantities' in row ? serveQuantities(row, nested) : row

    // Only the quantities selection is under test on the get path. The fake
    // does not check `catalogue`, which Fluent's schema requires here.
    if (/\binventoryPosition\s*\(/.test(body.query)) {
      const data = { inventoryPosition: serve(node('inventoryPositions', 0, position)) }
      return { data: { data: project(data, selection) } }
    }

    const field = FIELDS.find((f) => new RegExp(`\\b${f}\\s*\\(`).test(body.query))
    if (!field) throw new Error(`unexpected query ${body.query}`)
    seen.push({ field, query: body.query, variables: { ...vars }, authorization })

    const asked = vars['first']
    if (asked !== undefined && (typeof asked !== 'number' || !Number.isInteger(asked))) {
      return validationError(
        `Variable 'first' has an invalid value: ${String(asked)} is not an Int`,
      )
    }
    if (typeof asked === 'number' && asked < 1) {
      return validationError('Values of first and last must be within 1 - 5,000')
    }
    const first = typeof asked === 'number' ? Math.min(asked, DOC_MAX) : DOC_DEFAULT
    const after = vars['after']
    let start = 0
    if (after !== undefined) {
      const at = typeof after === 'string' ? indexOfCursor(field, after) : undefined
      if (at === undefined) return validationError(`'${String(after)}' is not a ${field} cursor`)
      start = at + 1
    }
    const end = Math.min(start + first, n)
    const edges = []
    for (let i = start; i < end; i++)
      edges.push({ node: serve(node(field, i, position)), cursor: cursorOf(field, i) })
    const data = { [field]: { edges, pageInfo: { hasNextPage: end < n } } }
    return { data: { data: project(data, selection) } }
  })
  vi.spyOn(axios, 'create').mockImplementation((cfg?: CreateAxiosDefaults) => {
    authorization = (cfg?.headers as Record<string, string> | undefined)?.['Authorization']
    return { post } as unknown as AxiosInstance
  })
  return { seen, post }
}

const CASES: ReadonlyArray<{ method: Method; field: Field }> = [
  { method: 'listProducts', field: 'variantProducts' },
  { method: 'listStockLevels', field: 'inventoryPositions' },
  { method: 'listLocations', field: 'locations' },
]

function call(
  adapter: FluentCommerceAdapter,
  method: Method,
  params: QueryParams,
  credentials: Credentials = CREDS,
): Promise<Array<{ id: string }>> {
  return adapter[method](credentials, params)
}

/** Drive a list the way the sync worker does: pages 1..pages at `limit`. */
async function drive(method: Method, limit: number, pages = 3) {
  const adapter = new FluentCommerceAdapter()
  const served: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const pageSize: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(adapter, method, params)
    served.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    pageSize.push(readUpstreamPage(params)?.pageSize)
  }
  return { served, hasMore, pageSize }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('fluent-commerce declares the documented page maximum', () => {
  it('declares maxPageSize 5000, so the router and the worker ask for what Fluent serves', () => {
    const adapter = new FluentCommerceAdapter()
    expect(adapter.capabilities?.maxPageSize).toBe(DOC_MAX)
  })
})

describe.each(CASES)('fluent-commerce $method paging ($field)', ({ method, field }) => {
  const L = 7

  it('serves N = 2L + 1 rows once each over three pages, and reports the end', async () => {
    const N = 2 * L + 1
    const { seen } = fakeFluent(N)
    const { served, hasMore } = await drive(method, L)
    expect(served).toEqual(ids(field, 1, N))
    expect(hasMore).toEqual([true, true, false])
    // One request per page: the walk remembers the cursor that starts each one.
    expect(seen).toHaveLength(3)
  })

  it('sends page 2 as documented: first = the limit, after = the last edge cursor of page 1', async () => {
    const { seen } = fakeFluent(2 * L + 1)
    await drive(method, L, 2)
    expect(seen[0]!.variables).toEqual({ first: L })
    expect(seen[1]!.variables).toEqual({ first: L, after: cursorOf(field, L - 1) })
    for (const s of seen) expect(s.field).toBe(field)
  })

  it('selects only PageInfo fields the schema has', async () => {
    const { seen } = fakeFluent(1)
    await drive(method, L, 1)
    expect(seen[0]!.query).toMatch(/pageInfo\s*\{\s*hasNextPage\s*\}/)
    expect(seen[0]!.query).not.toMatch(/endCursor/)
  })

  it('ends on page 2 when N = 2L, and page 3 is empty', async () => {
    const N = 2 * L
    const { seen } = fakeFluent(N)
    const { served, hasMore } = await drive(method, L)
    expect(served).toEqual(ids(field, 1, N))
    expect(hasMore).toEqual([true, false, false])
    // Page 3 is past the end the walk already reached: no request.
    expect(seen).toHaveLength(2)
  })

  it('clamps a limit above the documented maximum to 5000 and still serves every row', async () => {
    const N = 2 * DOC_MAX + 1
    const { seen } = fakeFluent(N)
    const { served, hasMore, pageSize } = await drive(method, 6000)
    expect(served).toEqual(ids(field, 1, N))
    expect(hasMore).toEqual([true, true, false])
    expect(seen.map((s) => s.variables['first'])).toEqual([DOC_MAX, DOC_MAX, DOC_MAX])
    // Each page is judged at the size actually asked for, not the caller's 6000.
    expect(pageSize).toEqual([DOC_MAX, DOC_MAX, DOC_MAX])
  })

  it('pages a limit as parseListQuery delivers it', async () => {
    const N = 2 * L + 1
    const { seen } = fakeFluent(N)
    const adapter = new FluentCommerceAdapter()
    const served: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, adapter)
      served.push(...(await call(adapter, method, params)).map((r) => r.id))
    }
    expect(served).toEqual(ids(field, 1, N))
    expect(seen.map((s) => s.variables['first'])).toEqual([L, L, L])
  })

  it('serves every row at the largest page the router allows', async () => {
    const N = 1001
    fakeFluent(N)
    const adapter = new FluentCommerceAdapter()
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: '10000' }, adapter)
      expect(params.limit).toBe(500)
      served.push(...(await call(adapter, method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(field, 1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports meta.hasMore on the API path (parseListQuery + listPage)', async () => {
    const N = 2 * L
    fakeFluent(N)
    const adapter = new FluentCommerceAdapter()
    const metas: Array<boolean | null> = []
    const served: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, adapter)
      const rows = await call(adapter, method, params)
      const envelope = listPage(rows, params, 'fluent-commerce')
      metas.push(envelope.meta.hasMore)
      served.push(...envelope.data.map((r) => r.id))
    }
    // Page 1 is full (7 of 7): only Fluent's hasNextPage can say there is more.
    // Page 2 is full too and is the last, which only hasNextPage can say either.
    expect(metas).toEqual([true, false, false])
    expect(served).toEqual(ids(field, 1, N))
  })

  it('keeps a walk across an access-token refresh on the same connection', async () => {
    const { seen } = fakeFluent(2 * L + 1)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: L }))
    const refreshed = { ...CREDS, accessToken: 'access-2' }
    const rows = await call(adapter, method, withPageSink({ page: 2, limit: L }), refreshed)
    expect(rows.map((r) => r.id)).toEqual(ids(field, L + 1, L))
    expect(seen).toHaveLength(2)
    expect(seen[1]!.authorization).toBe('Bearer access-2')
  })

  it('does not hand one connection another connection’s cursors on the same account', async () => {
    const { seen } = fakeFluent(2 * L + 1)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: L }))
    const other: Credentials = {
      ...CREDS,
      accessToken: 'other-access',
      refreshToken: 'other-refresh',
    }
    const rows = await call(adapter, method, withPageSink({ page: 2, limit: L }), other)
    expect(rows.map((r) => r.id)).toEqual(ids(field, L + 1, L))
    // The second connection walks from its own page 1, under its own token.
    const mine = seen.slice(1)
    expect(mine.map((s) => s.variables)).toEqual([
      { first: L },
      { first: L, after: cursorOf(field, L - 1) },
    ])
    expect(mine.every((s) => s.authorization === 'Bearer other-access')).toBe(true)
  })

  it('starts a new walk when the page size changes: a cursor is a position at one size', async () => {
    // The worker walks at 500 while an API caller pages the same collection
    // at 100; in miniature, page 1 at 7 and then page 2 at 5.
    const S = 5
    const { seen } = fakeFluent(3 * L)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: L }))
    const rows = await call(adapter, method, withPageSink({ page: 2, limit: S }))
    expect(rows.map((r) => r.id)).toEqual(ids(field, S + 1, S))
    expect(seen.slice(1).map((s) => s.variables)).toEqual([
      { first: S },
      { first: S, after: cursorOf(field, S - 1) },
    ])
    // The walk at 7 is still where it was: its page 2 is one request.
    const back = await call(adapter, method, withPageSink({ page: 2, limit: L }))
    expect(back.map((r) => r.id)).toEqual(ids(field, L + 1, L))
    expect(seen.slice(3).map((s) => s.variables)).toEqual([
      { first: L, after: cursorOf(field, L - 1) },
    ])
  })

  it('never hands this list another list’s cursor on the same connection', async () => {
    const other = CASES.find((c) => c.method !== method)!
    const { seen } = fakeFluent(2 * L + 1)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, other.method, withPageSink({ page: 1, limit: L }))
    const rows = await call(adapter, method, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(ids(field, L + 1, L))
    // This list walks from its own page 1, with its own cursors.
    expect(seen.filter((s) => s.field === field).map((s) => s.variables)).toEqual([
      { first: L },
      { first: L, after: cursorOf(field, L - 1) },
    ])
  })

  it('asks for 500 rows when a direct caller gives no limit', async () => {
    const { seen } = fakeFluent(1)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, method, {})
    // Not Fluent's silent default of 10, which the caller never asked for.
    expect(seen.map((s) => s.variables)).toEqual([{ first: 500 }])
  })

  it('sends a limit below Fluent’s minimum of 1 as 1', async () => {
    const { seen } = fakeFluent(3)
    const adapter = new FluentCommerceAdapter()
    await call(adapter, method, withPageSink({ page: 1, limit: 0 }))
    expect(seen.map((s) => s.variables)).toEqual([{ first: 1 }])
  })

  it('sends a fractional limit as the whole number below it, since `first` is an Int', async () => {
    const { seen } = fakeFluent(2 * L + 1)
    const adapter = new FluentCommerceAdapter()
    const params = withPageSink({ page: 1, limit: L + 0.5 })
    const rows = await call(adapter, method, params)
    expect(rows.map((r) => r.id)).toEqual(ids(field, 1, L))
    expect(seen.map((s) => s.variables)).toEqual([{ first: L }])
    expect(readUpstreamPage(params)?.pageSize).toBe(L)
  })

  it.each([
    ['no cursor', {}],
    ['a null cursor', { cursor: null }],
    ['an empty cursor', { cursor: '' }],
  ])(
    'refuses a page that claims more rows but whose last edge has %s',
    async (_label, edgeCursor) => {
      const post = vi.fn(async () => ({
        data: {
          data: {
            [field]: {
              edges: [
                { node: node(field, 0), cursor: cursorOf(field, 0) },
                { node: node(field, 1), ...edgeCursor },
              ],
              pageInfo: { hasNextPage: true },
            },
          },
        },
      }))
      vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as AxiosInstance)
      const adapter = new FluentCommerceAdapter()
      await expect(call(adapter, method, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
        /hasNextPage.*no edge cursor/,
      )
    },
  )

  // The schema types edges as `[InventoryPositionEdge]` and so on: nullable.
  // A null row is refused by name rather than dropped from a page the sync
  // worker would then store as complete.
  it.each([
    ['a null edge', null],
    ['an edge with a null node', { node: null, cursor: cursorOf(field, 1) }],
    ['an edge with no node', { cursor: cursorOf(field, 1) }],
  ])('refuses a page with %s rather than drop the row', async (_label, bad) => {
    const post = vi.fn(async () => ({
      data: {
        data: {
          [field]: {
            edges: [{ node: node(field, 0), cursor: cursorOf(field, 0) }, bad],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as AxiosInstance)
    const adapter = new FluentCommerceAdapter()
    await expect(call(adapter, method, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      `fluent-commerce ${field}: edge 1 carried no node`,
    )
  })

  it.each([
    ['no data', {}],
    ['no connection', { data: {} }],
    ['a null connection', { data: { [field]: null } }],
  ])('refuses a response with %s rather than read it as an empty last page', async (_l, body) => {
    const post = vi.fn(async () => ({ data: body }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as unknown as AxiosInstance)
    const adapter = new FluentCommerceAdapter()
    await expect(call(adapter, method, withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /carried no connection/,
    )
  })
})

describe('fluent-commerce stock levels read quantities as a connection', () => {
  it('listStockLevels reads RESERVED from quantities.edges[].node', async () => {
    fakeFluent(1)
    const adapter = new FluentCommerceAdapter()
    const [row] = await adapter.listStockLevels(CREDS, withPageSink({ page: 1, limit: 1 }))
    expect(row!.quantityOnHand).toBe(10)
    expect(row!.quantityCommitted).toBe(3)
    expect(row!.quantityAvailable).toBe(7)
  })

  // Pins the quantities selection only. The fake ignores the root field's
  // arguments, and Fluent's schema also requires `catalogue` on
  // `inventoryPosition`, which this query has never sent — a separate,
  // pre-existing defect of the get path.
  it('getStockLevel selects quantities as a connection too', async () => {
    fakeFluent(1)
    const adapter = new FluentCommerceAdapter()
    const row = await adapter.getStockLevel(CREDS, 'POS-00001')
    expect(row.id).toBe('POS-00001')
    expect(row.quantityCommitted).toBe(3)
  })
})

describe('fluent-commerce stock levels see past the nested connection’s default of 10', () => {
  // 11 CORRECTION, 11 RESERVED, then LAST_ON_HAND, with no `onHand`. Without
  // `first`, Fluent serves the first 10: all CORRECTION, so neither is read.
  // With only the type filter, it serves the first 10 RESERVED and no
  // LAST_ON_HAND.
  const behindTen: PositionData = {
    onHand: null,
    quantities: [
      ...records('CORRECTION', 11, 1),
      ...records('RESERVED', 11, 3),
      ...records('LAST_ON_HAND', 1, 9),
    ],
  }

  // 5,000 CORRECTION records, then RESERVED. `first` alone is capped at
  // 5,000, so only the type filter reaches it.
  const behindCap: PositionData = {
    onHand: 10,
    quantities: [...records('CORRECTION', DOC_MAX, 1), ...records('RESERVED', 1, 3)],
  }

  it('listStockLevels reads RESERVED and LAST_ON_HAND behind more than 10 records', async () => {
    fakeFluent(1, behindTen)
    const adapter = new FluentCommerceAdapter()
    const [row] = await adapter.listStockLevels(CREDS, withPageSink({ page: 1, limit: 1 }))
    expect(row!.quantityOnHand).toBe(9)
    expect(row!.quantityCommitted).toBe(3)
  })

  it('getStockLevel reads RESERVED and LAST_ON_HAND behind more than 10 records', async () => {
    fakeFluent(1, behindTen)
    const adapter = new FluentCommerceAdapter()
    const row = await adapter.getStockLevel(CREDS, 'POS-00001')
    expect(row.quantityOnHand).toBe(9)
    expect(row.quantityCommitted).toBe(3)
  })

  it('listStockLevels reads RESERVED behind 5,000 records of a type it does not read', async () => {
    fakeFluent(1, behindCap)
    const adapter = new FluentCommerceAdapter()
    const [row] = await adapter.listStockLevels(CREDS, withPageSink({ page: 1, limit: 1 }))
    expect(row!.quantityCommitted).toBe(3)
    expect(row!.quantityAvailable).toBe(7)
  })

  it('getStockLevel reads RESERVED behind 5,000 records of a type it does not read', async () => {
    fakeFluent(1, behindCap)
    const adapter = new FluentCommerceAdapter()
    const row = await adapter.getStockLevel(CREDS, 'POS-00001')
    expect(row.quantityCommitted).toBe(3)
    expect(row.quantityAvailable).toBe(7)
  })
})
