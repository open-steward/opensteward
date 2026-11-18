/**
 * Access Financials list and get methods against a fake Financials GraphQL
 * endpoint that honours only what the vendor documents.
 *
 * Paging (https://developer.erp.accessacloud.com/docs/financials/operations-types/queries):
 *   "The page size is set to 100. When data is returned we also include
 *    whether there is another page and the cursor to use to get that page."
 *   "after ... expects a cursor which is returned after a request or null if
 *    this is the initial request." "endCursor the value to send into after
 *    to request the next page, null if no subsequent page"
 *
 * The fake answers one connection per query: the field path the vendor's
 * examples use, with the arguments and variable types of the live schema
 * (`header(after: String, first: Int, filter: <Type>HeaderFilterInput)`,
 * and so on). Any other argument, a variable declared with another type, a
 * filter key it does not know, or a cursor it did not mint is a GraphQL
 * error. It applies the documented `eq` filters, serves at most `serves`
 * rows a page (100 by default), and fewer when `first` asks for fewer.
 * The nominal lines come back in insertion order unless the query sorts
 * them by `AuditNo`, and carry an edge cursor per line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AccessFinancialsAdapter } from '../../../../../../src/verticals/accounting/adapters/access-financials/index'
import type { Credentials } from '../../../../../../src/verticals/accounting/adapter/interface'
import {
  nominalLine,
  purchaseHeader,
  purchaseOrderHeader,
  recordDetails,
  salesHeader,
  salesOrderHeader,
} from './fixtures'

const PAGE_SIZE = 100

const creds = (token = 'tok-a'): Credentials => ({
  accessToken: token,
  extra: { subscriptionKey: `sub-${token}` },
})

type Row = Record<string, unknown>

interface Connection {
  /** The field path from the query root, as the vendor's examples nest it. */
  path: string[]
  /** Argument → the variable type the live schema gives it. */
  args: Record<string, string>
  /** Filter keys the fake applies, each as `eq` on the row (nested for records). */
  filters: Record<string, (row: Row, value: unknown) => boolean>
  /** Serve `edges { cursor node }` rather than `items`. */
  edges?: boolean
}

const eqOn =
  (field: string) =>
  (row: Row, f: unknown): boolean => {
    const cond = f as Record<string, unknown>
    const keys = Object.keys(cond)
    if (keys.length !== 1 || keys[0] !== 'eq') throw new GqlError(`Only eq is faked, got ${keys}`)
    return row[field] === cond['eq']
  }

const detailsCodeEq =
  (details: string) =>
  (row: Row, f: unknown): boolean => {
    const cond = f as { code?: { eq?: unknown } }
    const keys = Object.keys(cond)
    if (keys.length !== 1 || !cond.code || Object.keys(cond.code).join() !== 'eq') {
      throw new GqlError(`Only ${details}.code.eq is faked`)
    }
    return (row[details] as Row).code === cond.code.eq
  }

const CONNECTIONS: Record<string, Connection> = {
  salesHeaders: {
    path: ['debtors', 'transactions', 'allTransactions', 'header'],
    args: { after: 'String', first: 'Int', filter: 'SalesTransactionEnquiryHeaderFilterInput' },
    filters: { transactionType: eqOn('transactionType'), auditNo: eqOn('auditNo') },
  },
  purchaseHeaders: {
    path: ['creditors', 'transactions', 'allTransactions', 'header'],
    args: { after: 'String', first: 'Int', filter: 'PurchaseTransactionEnquiryHeaderFilterInput' },
    filters: { transactionType: eqOn('transactionType'), auditNo: eqOn('auditNo') },
  },
  customers: {
    path: ['debtors', 'masterRecords', 'customers', 'records'],
    args: { after: 'String', first: 'Int', filter: 'CustomerFilterInput' },
    filters: { customerDetails: detailsCodeEq('customerDetails') },
  },
  suppliers: {
    path: ['creditors', 'masterRecords', 'suppliers', 'records'],
    args: { after: 'String', first: 'Int', filter: 'SupplierFilterInput' },
    filters: { supplierDetails: detailsCodeEq('supplierDetails') },
  },
  nominalLines: {
    path: ['financials', 'transactions', 'allTransactions', 'details'],
    args: {
      after: 'String',
      first: 'Int',
      sort: '[NominalTransactionEnquiryDetailSortSortByInput!]',
      filter: 'NominalTransactionEnquiryDetailFilterInput',
    },
    filters: { auditNo: eqOn('auditNo') },
    edges: true,
  },
  salesOrders: {
    path: ['selling', 'transactions', 'outstandingSalesOrders', 'header'],
    args: { after: 'String', first: 'Int', filter: 'OutstandingSalesOrderHeaderFilterInput' },
    filters: { orderType: eqOn('orderType'), orderNumber: eqOn('orderNumber') },
  },
  purchaseOrders: {
    path: ['purchasing', 'transactions', 'outstandingPurchaseOrders', 'header'],
    args: { after: 'String', first: 'Int', filter: 'OutstandingPurchaseOrderHeaderFilterInput' },
    filters: { orderType: eqOn('orderType'), orderNumber: eqOn('orderNumber') },
  },
}

class GqlError extends Error {}

interface Call {
  connection: string
  args: Record<string, unknown>
  pageInfo?: { hasNextPage: boolean; endCursor: string | null }
  served?: number
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

/** Which connection the query reads, and the arguments it binds there. */
function locate(query: string): { name: string; bound: Map<string, string> } {
  for (const [name, c] of Object.entries(CONNECTIONS)) {
    const [leaf] = c.path.slice(-1)
    const nest = c.path
      .slice(0, -1)
      .map((p) => `${p}\\s*\\{\\s*`)
      .join('')
    const m = new RegExp(`${nest}${leaf}\\s*(?:\\(([^)]*)\\))?\\s*\\{`).exec(query)
    if (!m) continue
    const bound = new Map<string, string>()
    for (const [, arg, variable] of (m[1] ?? '').matchAll(/(\w+)\s*:\s*\$(\w+)/g)) {
      bound.set(arg!, variable!)
    }
    return { name, bound }
  }
  throw new GqlError('This fake does not serve that field path.')
}

const mint = (conn: string, token: string, offset: number) =>
  Buffer.from(`${conn}|${token}|${offset}`).toString('base64')

function redeem(conn: string, token: string, cursor: unknown): number {
  if (cursor === null || cursor === undefined) return 0
  const [kind, owner, offset] = Buffer.from(String(cursor), 'base64').toString().split('|')
  if (kind !== conn || owner !== token || !/^\d+$/.test(offset ?? '')) {
    throw new GqlError(`The cursor "${String(cursor)}" is not valid.`)
  }
  return Number(offset)
}

function nest(path: string[], leaf: unknown): unknown {
  return path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), leaf)
}

/** A fake Financials endpoint: `data[connection]` rows per token. */
function fakeFinancials(
  data: Partial<Record<keyof typeof CONNECTIONS, Row[]>>,
  opts: {
    serves?: number
    /** Rows per access token, for the connections that differ by token. */
    byToken?: Record<string, Partial<Record<keyof typeof CONNECTIONS, Row[]>>>
  } = {},
) {
  const serves = opts.serves ?? PAGE_SIZE
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, string> }) => {
    const token = String(cfg?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(
      async (_url: string, body: { query: string; variables?: Record<string, unknown> }) => {
        const variables = body.variables ?? {}
        try {
          const { name, bound } = locate(body.query)
          const conn = CONNECTIONS[name]!
          const call: Call = { connection: name, args: {} }
          calls.push(call)
          const declared = declaredVariables(body.query)
          for (const [arg, variable] of bound) {
            const want = conn.args[arg]
            if (!want) throw new GqlError(`Unknown argument "${arg}" on "${conn.path.at(-1)}".`)
            if (declared.get(variable) !== want) {
              throw new GqlError(`Variable "$${variable}" must be declared as ${want}.`)
            }
            if (variables[variable] !== undefined) call.args[arg] = variables[variable]
          }
          let rows = [...((opts.byToken?.[token] ?? data)[name] ?? [])]
          const filter = (call.args['filter'] ?? {}) as Record<string, unknown>
          for (const [key, cond] of Object.entries(filter)) {
            const apply = conn.filters[key]
            if (!apply) throw new GqlError(`Unknown filter field "${key}".`)
            rows = rows.filter((r) => apply(r, cond))
          }
          if (name === 'nominalLines') {
            const sort = call.args['sort'] as Array<{ field: string; order: string }> | undefined
            if (sort?.[0]?.field === 'AuditNo' && sort[0].order === 'Ascending') {
              rows.sort(
                (a, b) =>
                  Number(a['auditNo']) - Number(b['auditNo']) ||
                  String(a['primaryKey']).localeCompare(String(b['primaryKey'])),
              )
            }
          }
          const first = call.args['first']
          const size = first == null ? serves : Math.min(Number(first), serves)
          const start = redeem(name, token, call.args['after'])
          const items = rows.slice(start, start + size)
          const hasNextPage = start + items.length < rows.length
          const pageInfo = {
            hasNextPage,
            endCursor: hasNextPage ? mint(name, token, start + items.length) : null,
          }
          call.pageInfo = pageInfo
          call.served = items.length
          const page = conn.edges
            ? {
                pageInfo,
                edges: items.map((node, i) => ({ cursor: mint(name, token, start + i + 1), node })),
              }
            : { pageInfo, items }
          return { data: { data: nest(conn.path, page) } }
        } catch (err) {
          if (err instanceof GqlError) {
            return { data: { data: null, errors: [{ message: err.message }] } }
          }
          throw err
        }
      },
    )
    return { post } as never
  }) as never)
  return calls
}

type ListName =
  | 'listInvoices'
  | 'listBills'
  | 'listCreditMemos'
  | 'listTransactions'
  | 'listSalesOrders'
  | 'listPurchaseOrders'
  | 'listContacts'
  | 'listJournals'

async function syncPage(
  adapter: AccessFinancialsAdapter,
  method: ListName,
  page: number,
  limit: number,
) {
  const params = withPageSink({ page, limit })
  const items = (await adapter[method](creds(), params)) as Array<{ id?: string }>
  return { ids: items.map((i) => String(i.id)), meta: readUpstreamPage(params), items }
}

async function syncWalk(method: ListName, limit: number, pages: number) {
  const adapter = new AccessFinancialsAdapter()
  const ids: string[] = []
  const sizes: number[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const page = await syncPage(adapter, method, k, limit)
    ids.push(...page.ids)
    sizes.push(page.ids.length)
    hasMore.push(page.meta?.hasMore)
  }
  return { ids, sizes, hasMore }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── Header connections ─────────────────────────────────────────────────────────

interface HeaderCase {
  method: ListName
  connection: keyof typeof CONNECTIONS
  /** The filter the method must send. */
  filter: Record<string, unknown> | undefined
  /** A row the method lists, numbered i. */
  row: (i: number) => Row
  /** A row of the same connection the filter must exclude, or none. */
  other?: (i: number) => Row
  id: (i: number) => string
}

const HEADER_CASES: HeaderCase[] = [
  {
    method: 'listInvoices',
    connection: 'salesHeaders',
    filter: { transactionType: { eq: 'Invoice' } },
    row: (i) => ({ ...salesHeader({ auditNo: 1000 + i }) }),
    other: (i) => ({ ...salesHeader({ auditNo: 5000 + i, transactionType: 'CreditNote' }) }),
    id: (i) => String(1000 + i),
  },
  {
    method: 'listCreditMemos',
    connection: 'salesHeaders',
    filter: { transactionType: { eq: 'CreditNote' } },
    row: (i) => ({ ...salesHeader({ auditNo: 1000 + i, transactionType: 'CreditNote' }) }),
    other: (i) => ({ ...salesHeader({ auditNo: 5000 + i, transactionType: 'Invoice' }) }),
    id: (i) => String(1000 + i),
  },
  {
    method: 'listTransactions',
    connection: 'salesHeaders',
    filter: undefined,
    row: (i) => ({
      ...salesHeader({ auditNo: 1000 + i, transactionType: i % 2 ? 'Receipt' : 'Invoice' }),
    }),
    id: (i) => String(1000 + i),
  },
  {
    method: 'listBills',
    connection: 'purchaseHeaders',
    filter: { transactionType: { eq: 'Invoice' } },
    row: (i) => ({ ...purchaseHeader({ auditNo: 2000 + i }) }),
    other: (i) => ({ ...purchaseHeader({ auditNo: 6000 + i, transactionType: 'Payment' }) }),
    id: (i) => String(2000 + i),
  },
  {
    method: 'listSalesOrders',
    connection: 'salesOrders',
    filter: { orderType: { eq: 'Order' } },
    row: (i) => ({ ...salesOrderHeader({ orderNumber: 3000 + i }) }),
    other: (i) => ({ ...salesOrderHeader({ orderNumber: 7000 + i, orderType: 'Estimate' }) }),
    id: (i) => String(3000 + i),
  },
  {
    method: 'listPurchaseOrders',
    connection: 'purchaseOrders',
    filter: { orderType: { eq: 'Order' } },
    row: (i) => ({ ...purchaseOrderHeader({ orderNumber: String(5000 + i) }) }),
    other: (i) => ({
      ...purchaseOrderHeader({ orderNumber: String(8000 + i), orderType: 'PurchaseRequest' }),
    }),
    id: (i) => String(5000 + i),
  },
]

/** `n` listed rows, with an excluded row after every second one when the case has one. */
function rowsFor(c: HeaderCase, n: number): { rows: Row[]; ids: string[] } {
  const rows: Row[] = []
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    rows.push(c.row(i))
    ids.push(c.id(i))
    if (c.other && i % 2 === 1) rows.push(c.other(i))
  }
  return { rows, ids }
}

describe.each(HEADER_CASES)('$method', (c) => {
  it('N = 2L + 1 at a small L over uneven upstream pages: every row once, hasMore exact', async () => {
    const L = 4
    const { rows, ids } = rowsFor(c, 2 * L + 1)
    const calls = fakeFinancials({ [c.connection]: rows }, { serves: 3 })

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(ids)
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(calls.every((call) => call.connection === c.connection)).toBe(true)
    expect(calls.every((call) => call.args['first'] === PAGE_SIZE)).toBe(true)
    // Each request's `after` is the endCursor of the one before it.
    expect(calls[0]!.args['after']).toBeNull()
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]!.args['after']).toBe(calls[i - 1]!.pageInfo!.endCursor)
    }
  })

  it('N = 2L + 1 at L = the documented 100: one request per upstream page', async () => {
    const L = PAGE_SIZE
    const { rows, ids } = rowsFor(c, 2 * L + 1)
    const calls = fakeFinancials({ [c.connection]: rows })

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(ids)
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(new Set(walk.ids).size).toBe(walk.ids.length)
    // Rows the filter excludes never reach the caller, so the upstream
    // pages hold them too: one request per 100 filtered rows.
    expect(calls).toHaveLength(3)
  })

  it('sends the documented filter, and nothing it does not know', async () => {
    const calls = fakeFinancials({ [c.connection]: rowsFor(c, 2).rows })
    await syncPage(new AccessFinancialsAdapter(), c.method, 1, 10)
    expect(calls[0]!.args['filter']).toEqual(c.filter)
  })

  it('no rows: an empty page that says so', async () => {
    fakeFinancials({ [c.connection]: [] })
    const page = await syncPage(new AccessFinancialsAdapter(), c.method, 1, 10)
    expect(page.ids).toEqual([])
    expect(page.meta?.hasMore).toBe(false)
  })
})

it('a page that claims a next page without an endCursor is an error, not a silent end', async () => {
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    post: vi.fn(async () => ({
      data: {
        data: nest(CONNECTIONS['salesHeaders']!.path, {
          pageInfo: { hasNextPage: true, endCursor: null },
          items: [salesHeader()],
        }),
      },
    })),
  })) as never)
  await expect(
    new AccessFinancialsAdapter().listInvoices(creds(), withPageSink({ page: 1, limit: 10 })),
  ).rejects.toThrow(/no endCursor/)
})

it('a response without the connection is an empty last page, as listAccounts reads it', async () => {
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    post: vi.fn(async () => ({ data: { data: { debtors: null } } })),
  })) as never)
  const params = withPageSink({ page: 1, limit: 10 })
  expect(await new AccessFinancialsAdapter().listInvoices(creds(), params)).toEqual([])
  expect(readUpstreamPage(params)?.hasMore).toBe(false)
})

it('updatedAfter is not forwarded: no enquiry documents that never-edited rows carry a timestamp', async () => {
  const calls = fakeFinancials({ salesHeaders: [{ ...salesHeader() }] })
  const params: QueryParams = withPageSink({
    page: 1,
    limit: 10,
    updatedAfter: new Date('2024-01-01'),
  })
  await new AccessFinancialsAdapter().listInvoices(creds(), params)
  expect(calls[0]!.args['filter']).toEqual({ transactionType: { eq: 'Invoice' } })
})

// ── Contacts ───────────────────────────────────────────────────────────────────

describe('listContacts', () => {
  const customers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      customerDetails: recordDetails({ primaryKey: i, code: `C${i}`, name: `Customer ${i}` }),
    }))
  const suppliers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      supplierDetails: recordDetails({ primaryKey: i, code: `S${i}`, name: `Supplier ${i}` }),
    }))

  it('customers then suppliers, N = 2L + 1 over uneven pages: every contact once, hasMore exact', async () => {
    const L = 4
    const calls = fakeFinancials(
      { customers: customers(5), suppliers: suppliers(4) },
      { serves: 3 },
    )

    const walk = await syncWalk('listContacts', L, 3)

    expect(walk.ids).toEqual([
      ...['C0', 'C1', 'C2', 'C3', 'C4'].map((c) => `cust_${c}`),
      ...['S0', 'S1', 'S2', 'S3'].map((s) => `supp_${s}`),
    ])
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    // Each ledger is walked by its own cursors, the suppliers from null.
    const cust = calls.filter((c) => c.connection === 'customers')
    const supp = calls.filter((c) => c.connection === 'suppliers')
    expect(cust.map((c) => c.args['after'])).toEqual([null, cust[0]!.pageInfo!.endCursor])
    expect(supp.map((c) => c.args['after'])).toEqual([null, supp[0]!.pageInfo!.endCursor])
    expect(calls.every((c) => c.args['first'] === PAGE_SIZE)).toBe(true)
  })

  it('a page never holds more than the limit, even when both ledgers have rows', async () => {
    fakeFinancials({ customers: customers(3), suppliers: suppliers(3) })
    const page = await syncPage(new AccessFinancialsAdapter(), 'listContacts', 1, 4)
    expect(page.ids).toEqual(['cust_C0', 'cust_C1', 'cust_C2', 'supp_S0'])
    expect(page.meta?.hasMore).toBe(true)
  })

  it('no suppliers: the customers end the list', async () => {
    fakeFinancials({ customers: customers(2), suppliers: [] })
    const page = await syncPage(new AccessFinancialsAdapter(), 'listContacts', 1, 10)
    expect(page.ids).toEqual(['cust_C0', 'cust_C1'])
    expect(page.meta?.hasMore).toBe(false)
  })
})

// ── Journals ───────────────────────────────────────────────────────────────────

describe('listJournals', () => {
  /** Journals by audit number, with how many lines each has. */
  const JOURNALS: Array<[number, number]> = [
    [11, 1],
    [12, 4],
    [13, 2],
    [14, 3],
    [15, 1],
  ]
  /** The lines, stored out of audit-number order. */
  const lines = () => {
    const all = JOURNALS.flatMap(([auditNo, n]) =>
      Array.from({ length: n }, (_, i) => ({
        ...nominalLine({ auditNo, primaryKey: `${auditNo}-${i}`, headerRef: `J${auditNo}` }),
      })),
    )
    return [...all.filter((_, i) => i % 2 === 1), ...all.filter((_, i) => i % 2 === 0)]
  }

  it('N = 2L + 1 journals over pages of 3 lines: every journal once, whole, hasMore exact', async () => {
    const L = 2
    const calls = fakeFinancials({ nominalLines: lines() }, { serves: 3 })
    const adapter = new AccessFinancialsAdapter()

    const journals: Array<{ id?: string; lineItems?: unknown[] | null }> = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      journals.push(...(await adapter.listJournals(creds(), params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }

    expect(journals.map((j) => j.id)).toEqual(['11', '12', '13', '14', '15'])
    expect(journals.map((j) => j.lineItems?.length)).toEqual(JOURNALS.map(([, n]) => n))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => c.connection === 'nominalLines')).toBe(true)
    expect(calls.every((c) => c.args['first'] === PAGE_SIZE)).toBe(true)
    expect(calls[0]!.args['sort']).toEqual([
      { field: 'AuditNo', order: 'Ascending' },
      { field: 'PrimaryKey', order: 'Ascending' },
    ])
  })

  it('a journal longer than one upstream page is served whole', async () => {
    const long = Array.from({ length: 7 }, (_, i) => ({
      ...nominalLine({ auditNo: 20, primaryKey: `20-${i}` }),
    }))
    fakeFinancials(
      { nominalLines: [...long, { ...nominalLine({ auditNo: 21, primaryKey: '21-0' }) }] },
      { serves: 3 },
    )
    const adapter = new AccessFinancialsAdapter()

    const p1 = withPageSink({ page: 1, limit: 1 })
    const first = await adapter.listJournals(creds(), p1)
    const p2 = withPageSink({ page: 2, limit: 1 })
    const second = await adapter.listJournals(creds(), p2)

    expect(first.map((j) => [j.id, j.lineItems?.length])).toEqual([['20', 7]])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(second.map((j) => [j.id, j.lineItems?.length])).toEqual([['21', 1]])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('getJournal reads every line of one audit number', async () => {
    const calls = fakeFinancials({ nominalLines: lines() }, { serves: 3 })
    const j = await new AccessFinancialsAdapter().getJournal(creds(), '12')
    expect(j.id).toBe('12')
    expect(j.lineItems).toHaveLength(4)
    expect(calls.every((c) => (c.args['filter'] as Row)?.['auditNo'] !== undefined)).toBe(true)
  })

  it('getJournal of an unknown audit number is a 404', async () => {
    fakeFinancials({ nominalLines: lines() })
    await expect(new AccessFinancialsAdapter().getJournal(creds(), '99')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

// ── Gets ───────────────────────────────────────────────────────────────────────

describe('get methods read back the ids the lists return', () => {
  it('getInvoice filters the sales enquiry by auditNo and transactionType Invoice', async () => {
    const calls = fakeFinancials({
      salesHeaders: [
        { ...salesHeader({ auditNo: 7 }) },
        { ...salesHeader({ auditNo: 8, transactionType: 'CreditNote' }) },
      ],
    })
    const adapter = new AccessFinancialsAdapter()
    expect((await adapter.getInvoice(creds(), '7')).id).toBe('7')
    expect(calls[0]!.args['filter']).toEqual({
      transactionType: { eq: 'Invoice' },
      auditNo: { eq: 7 },
    })
    // A credit note is not an invoice.
    await expect(adapter.getInvoice(creds(), '8')).rejects.toMatchObject({ statusCode: 404 })
    expect((await adapter.getCreditMemo(creds(), '8')).id).toBe('8')
    expect((await adapter.getTransaction(creds(), '8')).type).toBe('CreditNote')
  })

  it('a non-numeric id is a 404 without a request', async () => {
    const calls = fakeFinancials({ salesHeaders: [] })
    await expect(new AccessFinancialsAdapter().getInvoice(creds(), 'abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toHaveLength(0)
  })

  it('getBill filters the purchase enquiry by auditNo and transactionType Invoice', async () => {
    const calls = fakeFinancials({ purchaseHeaders: [{ ...purchaseHeader({ auditNo: 9 }) }] })
    expect((await new AccessFinancialsAdapter().getBill(creds(), '9')).id).toBe('9')
    expect(calls[0]!.args['filter']).toEqual({
      transactionType: { eq: 'Invoice' },
      auditNo: { eq: 9 },
    })
  })

  it('getContact reads a customer or a supplier by code', async () => {
    const calls = fakeFinancials({
      customers: [{ customerDetails: recordDetails({ code: 'GB-1' }) }],
      suppliers: [{ supplierDetails: recordDetails({ code: 'GB-S-1' }) }],
    })
    const adapter = new AccessFinancialsAdapter()
    expect((await adapter.getContact(creds(), 'cust_GB-1')).id).toBe('cust_GB-1')
    expect((await adapter.getContact(creds(), 'supp_GB-S-1')).id).toBe('supp_GB-S-1')
    expect(calls.map((c) => c.args['filter'])).toEqual([
      { customerDetails: { code: { eq: 'GB-1' } } },
      { supplierDetails: { code: { eq: 'GB-S-1' } } },
    ])
    await expect(adapter.getContact(creds(), 'cust_NOPE')).rejects.toMatchObject({
      statusCode: 404,
    })
    await expect(adapter.getContact(creds(), 'GB-1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getSalesOrder and getPurchaseOrder filter by orderNumber', async () => {
    const calls = fakeFinancials({
      salesOrders: [{ ...salesOrderHeader({ orderNumber: 3000 }) }],
      purchaseOrders: [{ ...purchaseOrderHeader({ orderNumber: '5000' }) }],
    })
    const adapter = new AccessFinancialsAdapter()
    expect((await adapter.getSalesOrder(creds(), '3000')).id).toBe('3000')
    expect((await adapter.getPurchaseOrder(creds(), '5000')).id).toBe('5000')
    expect(calls.map((c) => c.args['filter'])).toEqual([
      { orderType: { eq: 'Order' }, orderNumber: { eq: 3000 } },
      { orderType: { eq: 'Order' }, orderNumber: { eq: '5000' } },
    ])
    await expect(adapter.getPurchaseOrder(creds(), '1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── Pager keys ─────────────────────────────────────────────────────────────────

describe('pager keys keep lists and connections apart', () => {
  const walkInterleaved = async (
    steps: Array<{ method: ListName; token: string }>,
    limit: number,
    pages: number,
  ) => {
    const adapter = new AccessFinancialsAdapter()
    const ids = new Map<string, string[]>()
    const hasMore = new Map<string, (boolean | undefined)[]>()
    for (let k = 1; k <= pages; k++) {
      for (const { method, token } of steps) {
        const params = withPageSink({ page: k, limit })
        const items = (await adapter[method](creds(token), params)) as Array<{ id?: string }>
        const key = `${method}@${token}`
        ids.set(key, [...(ids.get(key) ?? []), ...items.map((i) => String(i.id))])
        hasMore.set(key, [...(hasMore.get(key) ?? []), readUpstreamPage(params)?.hasMore])
      }
    }
    return { ids, hasMore }
  }

  it('invoices, credit memos and transactions share one enquiry but never each other’s positions', async () => {
    const rows: Row[] = []
    for (let i = 0; i < 5; i++) {
      rows.push({ ...salesHeader({ auditNo: 100 + i }) })
      rows.push({ ...salesHeader({ auditNo: 200 + i, transactionType: 'CreditNote' }) })
    }
    fakeFinancials({ salesHeaders: rows }, { serves: 3 })

    const { ids, hasMore } = await walkInterleaved(
      [
        { method: 'listInvoices', token: 'tok-a' },
        { method: 'listCreditMemos', token: 'tok-a' },
        { method: 'listTransactions', token: 'tok-a' },
      ],
      4,
      3,
    )

    expect(ids.get('listInvoices@tok-a')).toEqual(['100', '101', '102', '103', '104'])
    expect(ids.get('listCreditMemos@tok-a')).toEqual(['200', '201', '202', '203', '204'])
    expect(ids.get('listTransactions@tok-a')).toEqual(rows.map((r) => String(r['auditNo'])))
    expect(hasMore.get('listInvoices@tok-a')).toEqual([true, false, false])
    expect(hasMore.get('listTransactions@tok-a')).toEqual([true, true, false])
  })

  it.each([
    [
      'listInvoices',
      'salesHeaders',
      (t: string, i: number) => ({ ...salesHeader({ auditNo: (t === 'tok-a' ? 100 : 900) + i }) }),
      (t: string, i: number) => String((t === 'tok-a' ? 100 : 900) + i),
    ],
    [
      'listContacts',
      'customers',
      (t: string, i: number) => ({ customerDetails: recordDetails({ code: `${t}-${i}` }) }),
      (t: string, i: number) => `cust_${t}-${i}`,
    ],
    [
      'listJournals',
      'nominalLines',
      (t: string, i: number) => ({
        ...nominalLine({ auditNo: (t === 'tok-a' ? 100 : 900) + i, primaryKey: `${t}-${i}` }),
      }),
      (t: string, i: number) => String((t === 'tok-a' ? 100 : 900) + i),
    ],
  ] as const)(
    '%s: two connections walked in turn each get their own rows',
    async (method, connection, row, id) => {
      const data = (t: string) => ({ [connection]: Array.from({ length: 5 }, (_, i) => row(t, i)) })
      fakeFinancials({}, { serves: 3, byToken: { 'tok-a': data('tok-a'), 'tok-b': data('tok-b') } })

      const { ids } = await walkInterleaved(
        [
          { method, token: 'tok-a' },
          { method, token: 'tok-b' },
        ],
        2,
        3,
      )

      for (const t of ['tok-a', 'tok-b']) {
        expect(ids.get(`${method}@${t}`)).toEqual(Array.from({ length: 5 }, (_, i) => id(t, i)))
      }
    },
  )
})

// ── Lookups ────────────────────────────────────────────────────────────────────

describe('lookups', () => {
  it.each([
    ['getBill', 'x1'],
    ['getCreditMemo', 'abc'],
    ['getTransaction', '1.5'],
    ['getSalesOrder', 'SO-1'],
    ['getJournal', '-3'],
    ['getContact', 'cust_'],
    ['getContact', 'supp_'],
  ] as const)('%s(%s) is a 404 without a request', async (method, id) => {
    const calls = fakeFinancials({})
    await expect(new AccessFinancialsAdapter()[method](creds(), id)).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toHaveLength(0)
  })

  it('a lookup follows endCursor until the row turns up', async () => {
    const posts: Array<Record<string, unknown>> = []
    const pages = [
      { pageInfo: { hasNextPage: true, endCursor: 'c1' }, items: [] },
      { pageInfo: { hasNextPage: false, endCursor: null }, items: [salesHeader({ auditNo: 7 })] },
    ]
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      post: vi.fn(async (_url: string, body: { variables: Record<string, unknown> }) => {
        posts.push(body.variables)
        return { data: { data: nest(CONNECTIONS['salesHeaders']!.path, pages[posts.length - 1]) } }
      }),
    })) as never)

    expect((await new AccessFinancialsAdapter().getInvoice(creds(), '7')).id).toBe('7')
    expect(posts.map((v) => v['after'])).toEqual([null, 'c1'])
  })

  it('nominal lines without an audit number are journals of their own, never merged', async () => {
    fakeFinancials({
      nominalLines: [
        { ...nominalLine({ auditNo: null, primaryKey: 'n1' }) },
        { ...nominalLine({ auditNo: null, primaryKey: 'n2' }) },
        { ...nominalLine({ auditNo: 30, primaryKey: '30-0' }) },
      ],
    })
    const journals = await new AccessFinancialsAdapter().listJournals(
      creds(),
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(journals.map((j) => j.lineItems?.map((l) => l.id))).toEqual([['n1'], ['n2'], ['30-0']])
  })
})
