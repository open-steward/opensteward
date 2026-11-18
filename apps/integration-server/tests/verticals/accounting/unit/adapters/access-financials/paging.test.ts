/**
 * Access Financials account paging, against a fake upstream that honours only
 * the documented parameters.
 *
 * Paging is documented once for the whole Financials GraphQL API
 * (https://developer.erp.accessacloud.com/docs/financials/operations-types/queries):
 *   "The page size is set to 100. When data is returned we also include
 *    whether there is another page and the cursor to use to get that page."
 *   "after is the name of the input variable used to indicate the page of
 *    data to request. It expects a cursor which is returned after a request
 *    or null if this is the initial request."
 *   "endCursor the value to send into after to request the next page, null
 *    if no subsequent page"
 * and the master-record pages: "This API endpoint returns 100 records per
 * page." `NominalAccountsQueries.records` also takes `first: Int`, which
 * only the schema's GraphQL.NET boilerplate describes for master records.
 *
 * listAccounts used to read `params.cursor`, which the router never sets.
 * Every caller page was the first 100 accounts sliced to `limit`, so page 2
 * repeated page 1 and accounts past the first page were unreachable. It now
 * asks for the documented page of 100 and cuts the caller's rows out of what
 * comes back, so a page of any other size must not lose or repeat a row.
 *
 * The fake answers POST /financials-graphql at the seam the client uses (the
 * axios instance `axios.create` returns). It reads the arguments the query
 * binds on `financials.masterRecords.accounts.records` and honours only
 * `after` and `first`. Any other argument is a GraphQL error, and so is a
 * cursor it did not mint for that connection. A page holds at most `serves`
 * rows (100 by default, the documented size), and fewer when `first` asks
 * for fewer, unless it is told to ignore `first`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AccessFinancialsAdapter } from '../../../../../../src/verticals/accounting/adapters/access-financials/index'
import type {
  AccountingAdapter,
  Credentials,
} from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * The keys the adapter hands pageByRows, in call order. The wrapper only
 * records them: every call still runs the real pager.
 */
const pagerKeys = vi.hoisted(() => [] as string[])
vi.mock('@opensteward/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('@opensteward/shared')>()
  const pageByRows: typeof shared.pageByRows = (key, ...rest) => {
    pagerKeys.push(key)
    return shared.pageByRows(key, ...rest)
  }
  return { ...shared, pageByRows }
})

/** The documented page size: "The page size is set to 100." */
const PAGE_SIZE = 100

const creds = (token = 'tok-a'): Credentials => ({
  accessToken: token,
  extra: { subscriptionKey: `sub-${token}` },
})

interface AFAccountRow {
  details: { primaryKey: number; accountCode: string; accountName: string; accountType: string }
  summaryData: { balance: number }
}

interface Call {
  token: string
  query: string
  variables: Record<string, unknown>
  /** records(...) argument → the value its bound variable carried. */
  args: Record<string, unknown>
  /** What the fake answered with. */
  pageInfo?: { hasNextPage: boolean; endCursor: string | null }
  served?: number
}

interface FakeOptions {
  /** The most rows one page holds. Default: the documented 100. */
  serves?: number
  /** Serve `serves` rows whatever `first` asks for. Default false. */
  ignoresFirst?: boolean
  /**
   * GraphQL.NET's default connection: a non-empty last page still carries
   * its last row's cursor as `endCursor`, beside `hasNextPage: false`. The
   * Queries page shows `null` there, which is the default.
   */
  endCursorOnLastPage?: boolean
}

class GqlError extends Error {}

/** `records(<args>)` under financials.masterRecords.accounts, or undefined when the query is elsewhere. */
function recordsArgs(query: string): Map<string, string> | undefined {
  const m =
    /financials\s*\{\s*masterRecords\s*\{\s*accounts\s*\{\s*records\s*(?:\(([^)]*)\))?\s*\{/.exec(
      query,
    )
  if (!m) return undefined
  const args = new Map<string, string>()
  for (const [, name, variable] of (m[1] ?? '').matchAll(/(\w+)\s*:\s*\$(\w+)/g)) {
    args.set(name!, variable!)
  }
  return args
}

/** `$name: Type` declarations in the operation header. */
function declaredVariables(query: string): Map<string, string> {
  const header = /query\s*\(([^)]*)\)/.exec(query)?.[1] ?? ''
  const vars = new Map<string, string>()
  for (const [, name, type] of header.matchAll(/\$(\w+)\s*:\s*([\w![\]]+)/g)) {
    vars.set(name!, type!)
  }
  return vars
}

const mint = (token: string, offset: number) =>
  Buffer.from(`acct|${token}|${offset}`).toString('base64')

function redeem(token: string, cursor: unknown): number {
  if (cursor === null || cursor === undefined) return 0
  const [kind, owner, offset] = Buffer.from(String(cursor), 'base64').toString().split('|')
  if (kind !== 'acct' || owner !== token || !/^\d+$/.test(offset ?? '')) {
    throw new GqlError(`The cursor "${String(cursor)}" is not valid.`)
  }
  return Number(offset)
}

function accounts(n: number, from = 1000): AFAccountRow[] {
  return Array.from({ length: n }, (_, i) => ({
    details: {
      primaryKey: from + i,
      accountCode: `N${from + i}`,
      accountName: `Account ${from + i}`,
      accountType: 'E',
    },
    summaryData: { balance: i },
  }))
}

const idsOf = (rows: AFAccountRow[]) => rows.map((r) => String(r.details.primaryKey))

/** A fake Financials GraphQL endpoint whose data depends on the bearer token. */
function fakeFinancials(rowsFor: (token: string) => AFAccountRow[], opts: FakeOptions = {}) {
  const serves = opts.serves ?? PAGE_SIZE
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const token = String(cfg?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(
      async (_url: string, body: { query: string; variables?: Record<string, unknown> }) => {
        const variables = body.variables ?? {}
        const call: Call = { token, query: body.query, variables, args: {} }
        calls.push(call)
        try {
          const bound = recordsArgs(body.query)
          if (!bound) throw new GqlError('This fake serves financials.masterRecords.accounts only.')
          const declared = declaredVariables(body.query)
          for (const [arg, variable] of bound) {
            if (arg !== 'after' && arg !== 'first') {
              throw new GqlError(`Unknown argument "${arg}" on field "records".`)
            }
            const want = arg === 'after' ? 'String' : 'Int'
            if (declared.get(variable) !== want) {
              throw new GqlError(`Variable "$${variable}" must be declared as ${want}.`)
            }
            call.args[arg] = variables[variable]
          }
          const first = call.args['first']
          if (
            first !== undefined &&
            first !== null &&
            (!Number.isInteger(first) || Number(first) < 0)
          ) {
            throw new GqlError('first must be a non-negative integer.')
          }
          const size = opts.ignoresFirst || first == null ? serves : Math.min(Number(first), serves)
          const all = rowsFor(token)
          const start = redeem(token, call.args['after'])
          const items = all.slice(start, start + size)
          const hasNextPage = start + items.length < all.length
          const lastCursor = opts.endCursorOnLastPage && items.length > 0
          const pageInfo = {
            hasNextPage,
            endCursor: hasNextPage || lastCursor ? mint(token, start + items.length) : null,
          }
          call.pageInfo = pageInfo
          call.served = items.length
          return {
            data: {
              data: {
                financials: { masterRecords: { accounts: { records: { pageInfo, items } } } },
              },
            },
          }
        } catch (err) {
          if (err instanceof GqlError)
            return { data: { data: null, errors: [{ message: err.message }] } }
          throw err
        }
      },
    )
    return { post } as never
  }) as never)
  return calls
}

/** Call listAccounts the way the sync worker does: `withPageSink({ page, limit })`. */
async function syncPage(
  adapter: AccessFinancialsAdapter,
  c: Credentials,
  page: number,
  limit: number,
) {
  const params = withPageSink({ page, limit })
  const items = await adapter.listAccounts(c, params)
  return { items, meta: readUpstreamPage(params) }
}

/** Walk pages 1..n like the worker. */
async function syncWalk(
  adapter: AccessFinancialsAdapter,
  limit: number,
  pages: number,
  c = creds(),
) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  const pageSizes: (number | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const page = await syncPage(adapter, c, k, limit)
    ids.push(...page.items.map((a) => String(a.id)))
    sizes.push(page.items.length)
    hasMore.push(page.meta?.hasMore)
    pageSizes.push(page.meta?.pageSize)
  }
  return { ids, hasMore, sizes, pageSizes }
}

/** Each request's `after` is the endCursor of the request before it; the first sends null. */
function expectCursorChain(calls: Call[]) {
  expect(calls[0]!.args['after']).toBeNull()
  for (let i = 1; i < calls.length; i++) {
    expect(calls[i]!.args['after']).toBe(calls[i - 1]!.pageInfo!.endCursor)
  }
}

/** The adapter as a router holds it, whose declared `maxPageSize` (if any) parseListQuery reads. */
const routed = (adapter: AccessFinancialsAdapter): AccountingAdapter => adapter

beforeEach(() => {
  _resetCursorPager()
  pagerKeys.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('listAccounts', () => {
  it('N = 2L + 1 at L = the documented 100: every account once, in order, one request per upstream page', async () => {
    const L = PAGE_SIZE
    const rows = accounts(2 * L + 1)
    const calls = fakeFinancials(() => rows)

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.args['first'])).toEqual([PAGE_SIZE, PAGE_SIZE, PAGE_SIZE])
    expectCursorChain(calls)
  })

  it("the second upstream page is asked for with the documented `after`: the first page's endCursor", async () => {
    const rows = accounts(2 * PAGE_SIZE + 1)
    const calls = fakeFinancials(() => rows)
    const adapter = new AccessFinancialsAdapter()

    await syncPage(adapter, creds(), 1, PAGE_SIZE)
    const page2 = await syncPage(adapter, creds(), 2, PAGE_SIZE)

    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(calls[0]!.args['after']).toBeNull()
    expect(calls[0]!.pageInfo?.endCursor).toEqual(expect.any(String))
    expect(calls[1]!.args['after']).toBe(calls[0]!.pageInfo!.endCursor)
    expect(page2.items.map((a) => a.id)).toEqual(idsOf(rows).slice(PAGE_SIZE, 2 * PAGE_SIZE))
  })

  it('N = 2L at L = 100: page 2 ends the collection, and page 3 is empty without a request', async () => {
    const L = PAGE_SIZE
    const rows = accounts(2 * L)
    const calls = fakeFinancials(() => rows)

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, 0])
    expect(walk.hasMore).toEqual([true, false, false])
    expect(calls).toHaveLength(2)
  })

  it('N = 2L + 1 at a small L: the pages are cut from one upstream page of 100', async () => {
    const L = 4
    const rows = accounts(2 * L + 1)
    const calls = fakeFinancials(() => rows)

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.args['first'])).toEqual([PAGE_SIZE])
  })

  it('N = 2L at a small L: page 2 ends the collection, and page 3 is empty without a request', async () => {
    const L = 4
    const rows = accounts(2 * L)
    const calls = fakeFinancials(() => rows)

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, 0])
    expect(walk.hasMore).toEqual([true, false, false])
    expect(calls).toHaveLength(1)
  })

  it('upstream pages smaller than the caller page: every account once, hasMore exact, one request per upstream page', async () => {
    const L = 4
    const rows = accounts(2 * L + 1)
    const calls = fakeFinancials(() => rows, { serves: 3 })

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.served)).toEqual([3, 3, 3])
    expectCursorChain(calls)
  })

  it('an upstream that ignores `first` and serves more than it was asked for still serves every account once', async () => {
    const L = PAGE_SIZE
    const rows = accounts(3 * PAGE_SIZE + 1)
    const calls = fakeFinancials(() => rows, { serves: 150, ignoresFirst: true })

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 5)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, L, L, 1, 0])
    expect(walk.hasMore).toEqual([true, true, true, false, false])
    expect(calls.map((c) => c.served)).toEqual([150, 150, 1])
    expectCursorChain(calls)
  })

  it('a limit above the documented page size (the sync worker at 500) is filled from pages of 100', async () => {
    const L = 500
    const rows = accounts(6 * PAGE_SIZE + 1)
    const calls = fakeFinancials(() => rows)

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.sizes).toEqual([L, 6 * PAGE_SIZE + 1 - L, 0])
    expect(walk.hasMore).toEqual([true, false, false])
    // Every page is the caller's full size, so no smaller size is reported.
    expect(walk.pageSizes).toEqual([undefined, undefined, undefined])
    expect(calls.every((c) => c.args['first'] === PAGE_SIZE)).toBe(true)
    expect(calls).toHaveLength(7)
    expectCursorChain(calls)
  })

  it('the pages are cut from rows already fetched, and say so', async () => {
    fakeFinancials(() => accounts(10))
    const page = await syncPage(new AccessFinancialsAdapter(), creds(), 1, 4)
    expect(page.meta?.pagedLocally).toBe(true)
  })

  it("the router's default limit (parseListQuery with no ?limit) pages 100 at a time", async () => {
    const rows = accounts(2 * PAGE_SIZE + 1)
    const calls = fakeFinancials(() => rows)
    const adapter = new AccessFinancialsAdapter()

    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k) }, routed(adapter))
      expect(params.limit).toBe(100)
      ids.push(...(await adapter.listAccounts(creds(), params)).map((a) => String(a.id)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }

    expect(ids).toEqual(idsOf(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.args['first'])).toEqual([PAGE_SIZE, PAGE_SIZE, PAGE_SIZE])
  })

  it('params with no limit at all get a page of 100, not the whole collection', async () => {
    const rows = accounts(2 * PAGE_SIZE + 1)
    fakeFinancials(() => rows)

    const params: QueryParams = withPageSink({ page: 1 })
    const items = await new AccessFinancialsAdapter().listAccounts(creds(), params)

    expect(items.map((a) => a.id)).toEqual(idsOf(rows).slice(0, 100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('the API path: parseListQuery + listPage report meta.hasMore from the platform', async () => {
    const L = 4
    const rows = accounts(2 * L)
    fakeFinancials(() => rows)
    const adapter = new AccessFinancialsAdapter()

    const ids: string[] = []
    const metas: (boolean | null)[] = []
    for (let k = 1; k <= 2; k++) {
      const params = parseListQuery({ limit: String(L), page: String(k) }, routed(adapter))
      const env = listPage(await adapter.listAccounts(creds(), params), params, 'access-financials')
      ids.push(...env.data.map((a) => String(a.id)))
      metas.push(env.meta.hasMore)
    }

    // Both pages are full: only the pager's report can tell page 1 (more)
    // from page 2 (the last).
    expect(metas).toEqual([true, false])
    expect(ids).toEqual(idsOf(rows))
  })

  it('the API path at limit=500, page 2: the rows after the first 500, and meta says it is the last page', async () => {
    const rows = accounts(6 * PAGE_SIZE + 1)
    fakeFinancials(() => rows)
    const adapter = new AccessFinancialsAdapter()

    const params = parseListQuery({ limit: '500', page: '2' }, routed(adapter))
    const env = listPage(await adapter.listAccounts(creds(), params), params, 'access-financials')

    expect(env.data.map((a) => a.id)).toEqual(idsOf(rows).slice(500))
    expect(env.meta.limit).toBe(500)
    expect(env.meta.hasMore).toBe(false)
  })

  it('a cold request for page 3 walks the cursor chain from the first page', async () => {
    const L = 3
    const rows = accounts(10)
    const calls = fakeFinancials(() => rows, { serves: 3 })

    const page3 = await syncPage(new AccessFinancialsAdapter(), creds(), 3, L)

    expect(page3.items.map((a) => a.id)).toEqual(idsOf(rows).slice(6, 9))
    expect(page3.meta?.hasMore).toBe(true)
    expectCursorChain(calls)
    expect(calls[0]!.args['after']).toBeNull()
  })

  it("a walk at another limit starts page 3 at that limit's rows, from the positions already known", async () => {
    const rows = accounts(12)
    const calls = fakeFinancials(() => rows, { serves: 5 })
    const adapter = new AccessFinancialsAdapter()

    // At limit 5 page 3 starts at row 10; at limit 3 it starts at row 6.
    await syncPage(adapter, creds(), 1, 5)
    await syncPage(adapter, creds(), 2, 5)
    const walked = calls.length
    const page3 = await syncPage(adapter, creds(), 3, 3)

    expect(page3.items.map((a) => a.id)).toEqual(idsOf(rows).slice(6, 9))
    expect(page3.meta?.hasMore).toBe(true)
    // Row 6 is in the second upstream page, whose cursor the limit-5 walk
    // already learned: one request, starting there, not a walk from the top.
    expect(calls.slice(walked).map((c) => c.args['after'])).toEqual([calls[0]!.pageInfo!.endCursor])
  })

  it('two connections never share a walk: each pages its own accounts with its own requests', async () => {
    const worlds: Record<string, AFAccountRow[]> = {
      'tok-a': accounts(6, 1000),
      'tok-b': accounts(6, 2000),
    }
    const calls = fakeFinancials((token) => worlds[token]!)
    const adapter = new AccessFinancialsAdapter()

    await syncPage(adapter, creds('tok-a'), 1, 3)
    const b2 = await syncPage(adapter, creds('tok-b'), 2, 3)

    // tok-a's page 1 is held in memory; tok-b must not be served from it.
    expect(b2.items.map((a) => a.id)).toEqual(idsOf(worlds['tok-b']!).slice(3, 6))
    expect(b2.meta?.hasMore).toBe(false)
    expect(calls.filter((c) => c.token === 'tok-b').map((c) => c.args['after'])).toEqual([null])
  })

  it('the pager key names the connection by a fingerprint, never by its token or subscription key', async () => {
    fakeFinancials(() => accounts(3))
    const adapter = new AccessFinancialsAdapter()

    await syncPage(adapter, creds('tok-a'), 1, 3)
    await syncPage(adapter, creds('tok-b'), 1, 3)

    expect(pagerKeys).toHaveLength(2)
    expect(pagerKeys[0]).not.toBe(pagerKeys[1])
    for (const key of pagerKeys) {
      for (const secret of ['tok-a', 'tok-b', 'sub-tok-a', 'sub-tok-b']) {
        expect(key).not.toContain(secret)
      }
    }
  })

  it('a last page that still carries an endCursor (GraphQL.NET) ends the walk on hasNextPage: false', async () => {
    const L = 4
    const rows = accounts(2 * L)
    const calls = fakeFinancials(() => rows, { endCursorOnLastPage: true })

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 3)

    expect(calls[0]!.pageInfo).toEqual({ hasNextPage: false, endCursor: expect.any(String) })
    expect(walk.ids).toEqual(idsOf(rows))
    expect(walk.hasMore).toEqual([true, false, false])
    // No request follows the platform's hasNextPage: false.
    expect(calls).toHaveLength(1)
  })

  it('a last page that still carries an endCursor, ending exactly on a caller page: no extra request', async () => {
    const L = PAGE_SIZE
    const rows = accounts(2 * L)
    const calls = fakeFinancials(() => rows, { endCursorOnLastPage: true })

    const walk = await syncWalk(new AccessFinancialsAdapter(), L, 2)

    expect(walk.hasMore).toEqual([true, false])
    expect(calls).toHaveLength(2)
  })

  it('no accounts: an empty page that says so', async () => {
    fakeFinancials(() => [])
    const page = await syncPage(new AccessFinancialsAdapter(), creds(), 1, 10)
    expect(page.items).toEqual([])
    expect(page.meta?.hasMore).toBe(false)
  })
})
