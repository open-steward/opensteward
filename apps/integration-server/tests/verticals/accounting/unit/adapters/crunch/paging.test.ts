/**
 * Crunch paging, against a fake upstream that honours only the documented
 * parameters (https://developer.crunch.co.uk/api-documentation/).
 *
 *   - `GET /banking/bank-accounts` — "Get all bank accounts for the current
 *     user". No query parameters; returns `array[BankAccountDto]`, the whole
 *     collection. Sliced locally.
 *   - `GET /expenses/vat-types` — "Fetch all VAT types". No query parameters;
 *     returns `VatTypesDto` (`{ vatTypes: [...] }`), the whole collection.
 *     Sliced locally.
 *   - `GET /banking/bank-accounts/{id}/payments` — `page` "The index of the
 *     page to retrieve, based at 0", `size` "Maximum value allowed is 200.
 *     default: 20", `reconciled (required)`; returns the Spring page envelope
 *     `PagePaymentDto` (`content`, `number`, `last`, `totalPages`, …).
 *
 * Transactions are payments flattened out of every bank account, so one
 * upstream page is not one caller page. They used to be page N of EVERY
 * account at once (up to accounts × limit rows, the surplus truncated away by
 * the router, the next page starting past it) and never sent the required
 * `reconciled`. Now the row pager walks account by account, the unreconciled
 * payments then the reconciled ones, and cuts exactly the caller's rows. Every
 * call reads the account list first and keys the walk by it.
 *
 * `PagePaymentDto` documents every field as optional, so the fake can also
 * answer with less of the envelope (`last` only, `totalPages` only, bare
 * `content`), or with a broken one, to pin how the adapter finds a stream's end.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import { CrunchAdapter } from '../../../../../../src/verticals/accounting/adapters/crunch/index'
import type {
  AccountingAdapter,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/accounting/crunch/callback',
}
const creds = (token = 'tok-a') => ({ accessToken: token, refreshToken: `refresh-${token}` })

/** Documented maximum of `size` on the payments endpoint. */
const MAX_SIZE = 200

/** Requests one fake answers before it fails the test. */
const RUNAWAY = 2_000

interface Payment {
  id: number
  reconciled: boolean
  date: string
  amount: number
  amountType: 'DEBIT' | 'CREDIT'
}

/** What one Crunch company holds. */
interface World {
  /** Bank account ids, in list order; `null` is an account the list returns without an id. */
  accounts: (number | null)[]
  /** Payments per bank account id, in the documented default order (`date,asc`). */
  payments: Record<number, Payment[]>
  vatTypes: { name: string; vatPercent: number }[]
}

/**
 * How much of the `PagePaymentDto` envelope the fake returns. Every field of it
 * is documented as optional.
 *   - `spring`: the whole Spring page, as the doc's example shows it.
 *   - `lastOnly` / `totalPagesOnly`: `content` and `number` plus that one field.
 *   - `bare`: `content` alone.
 *   - `neverLast`: the whole page, but `last` is always false (a broken upstream).
 */
type Envelope = 'spring' | 'lastOnly' | 'totalPagesOnly' | 'bare' | 'neverLast'

interface FakeOptions {
  envelope?: Envelope
  /** Answer every payments request with page 0, whatever `page` asks for. */
  ignorePage?: boolean
}

interface Call {
  token: string
  path: string
  params: Record<string, unknown>
}

class HttpError extends Error {
  constructor(
    public response: { status: number; data: unknown },
    message: string,
  ) {
    super(message)
  }
}

function badRequest(message: string): never {
  throw new HttpError({ status: 400, data: { message } }, message)
}

/** `reconciled` as the query string carries it: axios writes a boolean as `true`/`false`. */
function readBoolean(raw: unknown, name: string): boolean {
  if (raw === true || raw === 'true') return true
  if (raw === false || raw === 'false') return false
  return badRequest(`${name} is required`)
}

function readInt(raw: unknown, fallback: number, name: string): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) return badRequest(`${name} must be a non-negative integer`)
  return n
}

/**
 * A fake Crunch public API at the seam the adapter's client uses: the axios
 * instance `axios.create` returns. The world answered depends on the bearer
 * token the instance was created with, so two connections see different data.
 */
function fakeCrunch(worldFor: (token: string) => World, opts: FakeOptions = {}) {
  const calls: Call[] = []
  const envelope = opts.envelope ?? 'spring'
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const token = String(cfg?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, reqOpts?: { params?: Record<string, unknown> }) => {
      const params = { ...(reqOpts?.params ?? {}) }
      // A walk that never ends would otherwise spin on resolved promises,
      // which no test timeout interrupts.
      if (calls.length >= RUNAWAY) throw new Error(`fake Crunch: over ${RUNAWAY} requests`)
      calls.push({ token, path, params })
      const world = worldFor(token)
      if (path === 'banking/bank-accounts') {
        return {
          data: world.accounts.map((id) =>
            id === null ? { displayName: 'No id' } : { id, displayName: `Account ${id}` },
          ),
        }
      }
      if (path === 'expenses/vat-types') {
        return { data: { vatTypes: world.vatTypes } }
      }
      const m = /^banking\/bank-accounts\/(\d+)\/payments$/.exec(path)
      if (m) {
        const reconciled = readBoolean(params['reconciled'], 'reconciled')
        const page = opts.ignorePage ? 0 : readInt(params['page'], 0, 'page')
        const size = readInt(params['size'], 20, 'size')
        if (size < 1 || size > MAX_SIZE) badRequest(`size must be 1..${MAX_SIZE}`)
        const all = (world.payments[Number(m[1])] ?? []).filter((p) => p.reconciled === reconciled)
        const content = all.slice(page * size, page * size + size)
        const totalPages = Math.ceil(all.length / size)
        const last = page >= totalPages - 1
        const spring = {
          content,
          number: page,
          size,
          numberOfElements: content.length,
          totalElements: all.length,
          totalPages,
          first: page === 0,
          last,
          empty: content.length === 0,
        }
        const data =
          envelope === 'spring'
            ? spring
            : envelope === 'neverLast'
              ? { ...spring, last: false }
              : envelope === 'lastOnly'
                ? { content, number: page, last }
                : envelope === 'totalPagesOnly'
                  ? { content, number: page, totalPages }
                  : { content }
        return { data }
      }
      throw new HttpError({ status: 404, data: {} }, `no route ${path}`)
    })
    return { get } as never
  }) as never)
  return calls
}

let nextPaymentId = 1
/** `n` payments on one account, all reconciled or all not, with ascending dates. */
function payments(n: number, reconciled: boolean): Payment[] {
  return Array.from({ length: n }, () => {
    const id = nextPaymentId++
    return {
      id,
      reconciled,
      date: new Date(Date.UTC(2026, 0, 1) + id * 60_000).toISOString().slice(0, 10),
      amount: id,
      amountType: 'DEBIT' as const,
    }
  })
}

/**
 * The order the adapter documents: account by account, each account's
 * unreconciled payments then its reconciled ones, each in upstream order.
 */
function streamOrder(world: World): string[] {
  return world.accounts.flatMap((a) => {
    if (a === null) return []
    const all = world.payments[a] ?? []
    return [...all.filter((p) => !p.reconciled), ...all.filter((p) => p.reconciled)].map((p) =>
      String(p.id),
    )
  })
}

/** Call a list method the way the sync worker does: `withPageSink({ page, limit })`. */
async function syncPage<T>(list: (p: QueryParams) => Promise<T[]>, page: number, limit: number) {
  const params = withPageSink({ page, limit })
  const items = await list(params)
  return { items, hasMore: readUpstreamPage(params)?.hasMore, meta: readUpstreamPage(params) }
}

/** Walk pages 1..n like the worker, returning each page's ids and hasMore. */
async function syncWalk<T extends { id?: string }>(
  list: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const page = await syncPage(list, k, limit)
    ids.push(...page.items.map((x) => String(x.id)))
    sizes.push(page.items.length)
    hasMore.push(page.hasMore)
  }
  return { ids, hasMore, sizes }
}

/** The adapter as a router holds it, whose declared `maxPageSize` (if any) parseListQuery reads. */
const routed = (adapter: CrunchAdapter): AccountingAdapter => adapter

const paymentCalls = (calls: Call[]) => calls.filter((c) => c.path.endsWith('/payments'))

/** Each payments request as `account reconciled page`, e.g. `11 false 0`. */
const paymentRequests = (calls: Call[]) =>
  paymentCalls(calls).map(
    (c) =>
      `${/bank-accounts\/(\d+)\//.exec(c.path)![1]} ${String(c.params['reconciled'])} ${String(c.params['page'])}`,
  )

beforeEach(() => {
  _resetRowPager()
  nextPaymentId = 1
})
afterEach(() => vi.restoreAllMocks())

// ── Transactions: rows flattened out of every bank account ───────────────────

describe('listTransactions', () => {
  it('N = 2L + 1 across accounts and both reconciled streams: every row once, in order', async () => {
    const L = 3
    // 7 payments: account 11 holds 2 + 2, account 22 holds 0 + 3, account 33 none.
    const world: World = {
      accounts: [11, 22, 33],
      payments: {
        11: [...payments(2, false), ...payments(2, true)],
        22: payments(3, true),
      },
      vatTypes: [],
    }
    const calls = fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)

    const walk = await syncWalk(list, L, 3)

    expect(walk.ids).toEqual(streamOrder(world))
    expect(walk.ids).toHaveLength(2 * L + 1)
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    // Every payments request carries the required `reconciled` and a size
    // within the documented maximum.
    for (const c of paymentCalls(calls)) {
      expect(['true', 'false']).toContain(String(c.params['reconciled']))
      expect(Number(c.params['size'])).toBeLessThanOrEqual(MAX_SIZE)
    }
  })

  it('page 2 continues into the next 0-based upstream page (`page=1`) of the same stream', async () => {
    const L = 150
    // 301 payments: account 11 holds 250 unreconciled (two upstream pages of
    // 200) and 30 reconciled, account 22 holds 21 reconciled.
    const world: World = {
      accounts: [11, 22],
      payments: {
        11: [...payments(250, false), ...payments(30, true)],
        22: payments(21, true),
      },
      vatTypes: [],
    }
    const calls = fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)

    const p1 = await syncPage(list, 1, L)
    const before = calls.length
    const p2 = await syncPage(list, 2, L)
    const p3 = await syncPage(list, 3, L)

    const ids = [...p1.items, ...p2.items, ...p3.items].map((t) => t.id)
    expect(ids).toEqual(streamOrder(world))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    // Page 2 reads the account list, then the second upstream page of account
    // 11's unreconciled payments: the documented 0-based `page=1`.
    expect(calls[before]).toMatchObject({ path: 'banking/bank-accounts', params: {} })
    expect(calls[before + 1]).toMatchObject({
      path: 'banking/bank-accounts/11/payments',
      params: { page: 1, size: MAX_SIZE, reconciled: false },
    })
  })

  it('moving to the next account starts its stream at upstream page 0', async () => {
    const L = 200
    // 401 = 2L + 1: account 11 holds 250 reconciled payments (upstream pages 0
    // and 1 of its reconciled stream), account 22 holds 151 unreconciled.
    const world: World = {
      accounts: [11, 22],
      payments: { 11: payments(250, true), 22: payments(151, false) },
      vatTypes: [],
    }
    const calls = fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)

    const walk = await syncWalk(list, L, 3)

    expect(walk.ids).toEqual(streamOrder(world))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(paymentRequests(calls)).toEqual([
      '11 false 0',
      '11 true 0',
      '11 true 1',
      '22 false 0',
      '22 true 0',
    ])
    // A lookup walks the same stream.
    const first22 = world.payments[22]![0]!
    const found = await adapter.getTransaction(creds(), String(first22.id))
    expect(found.id).toBe(String(first22.id))
    expect(found.accountId).toBe('22')
  })

  it('an account list that changed starts a new walk, even for a page jump', async () => {
    const L = 100
    const world: World = {
      accounts: [11, 22],
      payments: { 11: payments(400, false), 22: payments(400, false) },
      vatTypes: [],
    }
    fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)
    await syncWalk(list, L, 9)

    // A new account at the front of the list: every later row moves by 250.
    world.accounts = [5, 11, 22]
    world.payments[5] = payments(250, false)
    const order = streamOrder(world)

    const p1 = await syncPage(list, 1, L)
    expect(p1.items.map((t) => t.id)).toEqual(order.slice(0, L))
    // Rows 400..499: account 11's payments 150..249, not whatever sat at the
    // recorded positions under the old list.
    const p5 = await syncPage(list, 5, L)
    expect(p5.items.map((t) => t.id)).toEqual(order.slice(400, 500))
    expect(p5.items.every((t) => t.accountId === '11')).toBe(true)
    const p11 = await syncPage(list, 11, L)
    expect(p11.items.map((t) => t.id)).toEqual(order.slice(1000, 1050))
    expect(p11.hasMore).toBe(false)
  })

  it('N = 2L: page 2 ends the collection exactly', async () => {
    const L = 150
    const world: World = {
      accounts: [11, 22],
      payments: { 11: payments(200, false), 22: [...payments(50, false), ...payments(50, true)] },
      vatTypes: [],
    }
    fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)

    const walk = await syncWalk(list, L, 3)

    expect(walk.ids).toEqual(streamOrder(world))
    expect(walk.sizes).toEqual([L, L, 0])
    expect(walk.hasMore).toEqual([true, false, false])
  })

  it('a limit above the documented maximum of 200 still serves every row, at size <= 200 upstream', async () => {
    const L = 500
    const world: World = {
      accounts: [11, 22, 33],
      payments: {
        11: [...payments(420, false), ...payments(81, true)],
        22: payments(250, false),
        33: payments(250, true),
      },
      vatTypes: [],
    }
    const calls = fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTransactions(creds(), p)

    const walk = await syncWalk(list, L, 3)

    expect(walk.ids).toEqual(streamOrder(world))
    expect(walk.ids).toHaveLength(2 * L + 1)
    expect(walk.hasMore).toEqual([true, true, false])
    // The fake answers a size over 200 with a 400, so reaching here proves it
    // was never sent; check it anyway.
    expect(Math.max(...paymentCalls(calls).map((c) => Number(c.params['size'])))).toBe(MAX_SIZE)
  })

  it('a limit as delivered by parseListQuery: absent, so the default of 100', async () => {
    // 201 = 2 × 100 + 1.
    const world: World = {
      accounts: [11],
      payments: { 11: [...payments(150, false), ...payments(51, true)] },
      vatTypes: [],
    }
    fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)

    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k) }, routed(adapter))
      expect(params.limit).toBe(100)
      ids.push(...(await adapter.listTransactions(creds(), params)).map((t) => String(t.id)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(streamOrder(world))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the API path: parseListQuery + listPage report meta.hasMore exactly', async () => {
    const L = 4
    const world: World = {
      accounts: [11, 22],
      payments: { 11: payments(4, false), 22: payments(4, true) },
      vatTypes: [],
    }
    fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)

    const metas: (boolean | null)[] = []
    const ids: string[] = []
    for (let k = 1; k <= 2; k++) {
      const params = parseListQuery({ limit: String(L), page: String(k) }, routed(adapter))
      const env = listPage(await adapter.listTransactions(creds(), params), params, 'crunch')
      ids.push(...env.data.map((t) => String(t.id)))
      metas.push(env.meta.hasMore)
    }
    // Page 1 is full (4 of 8): only the adapter's report can say more follows,
    // and page 2 is full too but the last.
    expect(metas).toEqual([true, false])
    expect(ids).toEqual(streamOrder(world))
  })

  it('two connections never share a walk or its rows', async () => {
    const worlds: Record<string, World> = {
      'tok-a': { accounts: [11], payments: { 11: payments(6, false) }, vatTypes: [] },
      'tok-b': { accounts: [11], payments: { 11: payments(6, false) }, vatTypes: [] },
    }
    const calls = fakeCrunch((token) => worlds[token]!)
    const adapter = new CrunchAdapter(CFG)

    await adapter.listTransactions(creds('tok-a'), withPageSink({ page: 1, limit: 3 }))
    const b2 = await adapter.listTransactions(creds('tok-b'), withPageSink({ page: 2, limit: 3 }))

    expect(b2.map((t) => t.id)).toEqual(streamOrder(worlds['tok-b']!).slice(3, 6))
    expect(calls.filter((c) => c.token === 'tok-b').length).toBeGreaterThan(0)
  })

  it('no bank accounts: an empty page that says so', async () => {
    fakeCrunch(() => ({ accounts: [], payments: {}, vatTypes: [] }))
    const page = await syncPage((p) => new CrunchAdapter(CFG).listTransactions(creds(), p), 1, 10)
    expect(page.items).toEqual([])
    expect(page.hasMore).toBe(false)
  })

  it('no limit at all: a page of the Crunch default of 20', async () => {
    const world: World = { accounts: [11], payments: { 11: payments(25, false) }, vatTypes: [] }
    fakeCrunch(() => world)
    const params = withPageSink({ page: 1 })
    const items = await new CrunchAdapter(CFG).listTransactions(creds(), params)
    expect(items.map((t) => t.id)).toEqual(streamOrder(world).slice(0, 20))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a bank account listed without an id is skipped, not requested as `undefined`', async () => {
    const world: World = {
      accounts: [null, 11],
      payments: { 11: [...payments(2, false), ...payments(1, true)] },
      vatTypes: [],
    }
    const calls = fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)

    const page = await syncPage((p) => adapter.listTransactions(creds(), p), 1, 10)

    expect(page.items.map((t) => t.id)).toEqual(streamOrder(world))
    expect(page.hasMore).toBe(false)
    expect(paymentRequests(calls)).toEqual(['11 false 0', '11 true 0'])
    const last = world.payments[11]![2]!
    expect((await adapter.getTransaction(creds(), String(last.id))).id).toBe(String(last.id))
  })
})

// ── Where a payments stream ends ─────────────────────────────────────────────

describe('the end of a payments stream', () => {
  // 451 payments: account 11 holds 250 unreconciled (a full upstream page and
  // a short one) and exactly 200 reconciled (one full page, then nothing),
  // account 22 no unreconciled and 1 reconciled.
  const world = (): World => ({
    accounts: [11, 22],
    payments: { 11: [...payments(250, false), ...payments(200, true)], 22: payments(1, true) },
    vatTypes: [],
  })
  const oneRequestPerPage = ['11 false 0', '11 false 1', '11 true 0', '22 false 0', '22 true 0']

  it.each([
    // `last`, else `totalPages`, says where the stream ends: no request past it.
    ['spring' as const, oneRequestPerPage],
    ['lastOnly' as const, oneRequestPerPage],
    ['totalPagesOnly' as const, oneRequestPerPage],
    // Only a short page can end it, so a full last page costs one more request.
    [
      'bare' as const,
      ['11 false 0', '11 false 1', '11 true 0', '11 true 1', '22 false 0', '22 true 0'],
    ],
  ])('envelope %s: every row once, and the requests it takes', async (envelope, requests) => {
    const w = world()
    const calls = fakeCrunch(() => w, { envelope })
    const adapter = new CrunchAdapter(CFG)

    const walk = await syncWalk((p) => adapter.listTransactions(creds(), p), 300, 2)

    expect(walk.ids).toEqual(streamOrder(w))
    expect(walk.sizes).toEqual([300, 151])
    expect(walk.hasMore).toEqual([true, false])
    expect(paymentRequests(calls)).toEqual(requests)
  })

  it('an envelope that never says `last`: each stream ends at its first empty page', async () => {
    const w = world()
    const calls = fakeCrunch(() => w, { envelope: 'neverLast' })
    const adapter = new CrunchAdapter(CFG)

    const walk = await syncWalk((p) => adapter.listTransactions(creds(), p), 300, 2)

    expect(walk.ids).toEqual(streamOrder(w))
    expect(walk.hasMore).toEqual([true, false])
    expect(paymentRequests(calls)).toEqual([
      '11 false 0',
      '11 false 1',
      '11 false 2',
      '11 true 0',
      '11 true 1',
      '22 false 0',
      '22 true 0',
      '22 true 1',
    ])
    // A lookup that misses ends too, rather than asking for pages forever.
    await expect(adapter.getTransaction(creds(), '999999')).rejects.toThrow(/not found/)
  })

  it('a lookup gives up after 1,000 upstream pages when a stream never ends', async () => {
    // An upstream that ignores `page` answers page 0, full and not last, forever.
    const w: World = { accounts: [11], payments: { 11: payments(201, false) }, vatTypes: [] }
    const calls = fakeCrunch(() => w, { ignorePage: true })

    await expect(new CrunchAdapter(CFG).getTransaction(creds(), '999999')).rejects.toThrow(
      /gave up after 1000 pages/,
    )
    expect(paymentCalls(calls)).toHaveLength(1000)
  })
})

describe('getTransaction', () => {
  it('finds a payment past the first upstream page and in a later account', async () => {
    const world: World = {
      accounts: [11, 22],
      payments: { 11: payments(250, false), 22: payments(5, true) },
      vatTypes: [],
    }
    fakeCrunch(() => world)
    const adapter = new CrunchAdapter(CFG)
    const late = world.payments[11]![240]!
    const other = world.payments[22]![4]!

    expect((await adapter.getTransaction(creds(), String(late.id))).id).toBe(String(late.id))
    const found = await adapter.getTransaction(creds(), String(other.id))
    expect(found.id).toBe(String(other.id))
    expect(found.accountId).toBe('22')
    await expect(adapter.getTransaction(creds(), '999999')).rejects.toThrow(/not found/)
  })
})

// ── Whole-collection endpoints, sliced locally ───────────────────────────────

describe('listAccounts', () => {
  const world = (n: number): World => ({
    accounts: Array.from({ length: n }, (_, i) => 100 + i),
    payments: {},
    vatTypes: [],
  })

  it('N = 2L + 1: every account once, hasMore and the total exact', async () => {
    const L = 4
    const w = world(2 * L + 1)
    const calls = fakeCrunch(() => w)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listAccounts(creds(), p)

    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await syncPage(list, k, L))

    expect(pages.flatMap((p) => p.items.map((a) => a.id))).toEqual(w.accounts.map(String))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.meta?.totalCount)).toEqual([9, 9, 9])
    // The endpoint documents no query parameters; none are sent.
    expect(calls.map((c) => [c.path, Object.keys(c.params)])).toEqual(
      Array.from({ length: 3 }, () => ['banking/bank-accounts', []]),
    )
  })

  it('N = 2L, a limit of 500, and a parseListQuery limit', async () => {
    const L = 4
    const w = world(2 * L)
    fakeCrunch(() => w)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listAccounts(creds(), p)

    const walk = await syncWalk(list, L, 3)
    expect(walk.ids).toEqual(w.accounts.map(String))
    expect(walk.hasMore).toEqual([true, false, false])

    const big = await syncPage(list, 1, 500)
    expect(big.items).toHaveLength(2 * L)
    expect(big.hasMore).toBe(false)

    const params = parseListQuery({ limit: '3', page: '3' }, routed(adapter))
    const env = listPage(await adapter.listAccounts(creds(), params), params, 'crunch')
    expect(env.data.map((a) => a.id)).toEqual(w.accounts.slice(6, 8).map(String))
    expect(env.meta.hasMore).toBe(false)
    expect(env.meta.totalCount).toBe(8)
  })

  it('the API path: a full first page says more follows', async () => {
    const w = world(9)
    fakeCrunch(() => w)
    const adapter = new CrunchAdapter(CFG)
    const params = parseListQuery({ limit: '4', page: '2' }, routed(adapter))
    const env = listPage(await adapter.listAccounts(creds(), params), params, 'crunch')
    expect(env.data.map((a) => a.id)).toEqual(w.accounts.slice(4, 8).map(String))
    expect(env.meta.hasMore).toBe(true)
  })
})

describe('listTaxRates', () => {
  const world = (n: number): World => ({
    accounts: [],
    payments: {},
    vatTypes: Array.from({ length: n }, (_, i) => ({ name: `VAT_${i}`, vatPercent: i })),
  })

  it('N = 2L + 1: every VAT type once, hasMore and the total exact', async () => {
    const L = 5
    const w = world(2 * L + 1)
    const calls = fakeCrunch(() => w)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTaxRates(creds(), p)

    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await syncPage(list, k, L))

    expect(pages.flatMap((p) => p.items.map((t) => t.id))).toEqual(w.vatTypes.map((v) => v.name))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.meta?.totalCount)).toEqual([11, 11, 11])
    expect(calls.map((c) => [c.path, Object.keys(c.params)])).toEqual(
      Array.from({ length: 3 }, () => ['expenses/vat-types', []]),
    )
  })

  it('N = 2L, a limit of 500, and the API path through parseListQuery + listPage', async () => {
    const L = 5
    const w = world(2 * L)
    fakeCrunch(() => w)
    const adapter = new CrunchAdapter(CFG)
    const list = (p: QueryParams) => adapter.listTaxRates(creds(), p)

    const walk = await syncWalk(list, L, 3)
    expect(walk.ids).toEqual(w.vatTypes.map((v) => v.name))
    expect(walk.hasMore).toEqual([true, false, false])

    expect((await syncPage(list, 1, 500)).items).toHaveLength(2 * L)

    const params = parseListQuery({ limit: String(L), page: '1' }, routed(adapter))
    const env = listPage(await adapter.listTaxRates(creds(), params), params, 'crunch')
    expect(env.data.map((t) => t.id)).toEqual(w.vatTypes.slice(0, L).map((v) => v.name))
    expect(env.meta.hasMore).toBe(true)
  })

  // Pins that the lookup is not sliced to a page (listTaxRates with a limit).
  // Calling listTaxRates(creds, {}) would pass too: with no limit, pageLocally
  // serves every row.
  it('getTaxRate finds a VAT type past the first page of the list', async () => {
    const w = world(250)
    fakeCrunch(() => w)
    const rate = await new CrunchAdapter(CFG).getTaxRate(creds(), 'VAT_249')
    expect(rate.rate).toBe(249)
  })
})
