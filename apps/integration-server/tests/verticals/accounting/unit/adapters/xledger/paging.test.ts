/**
 * Xledger list paging: every rebuilt list serves the caller's page `page` at
 * `limit`, from the documented Relay connections.
 *
 * First-party sources the fake upstream is built from:
 *   GraphQL Documentation (Google Doc linked from github.com/xledger/graphql-samples):
 *     "For pagination, Xledger supports the Relay pagination specification."
 *     "If there is a next page, and you want to get the next one, specify the
 *      "after" field, and use one of the cursors (for example, the last one)
 *      to get the first N records after that one."
 *   GraphQL pagination (article 23685633055250):
 *     "Xledger's API has a limit of 10000 records per query"
 *     "each records will have a cursor attached (in most cases the dbId)"
 *   Customer invoices (8703588077330) / Supplier invoices (8714771914898):
 *     arTransactions / apTransactions nodes `dbId invoiceNumber invoiceRemaining
 *     invoiceAmount reconciled extIdentifier`; a credit note is a node with a
 *     negative invoiceAmount.
 *   Create or update customer (8681708023698) / supplier (8674660344338):
 *     customers nodes `code description dbId companyDbId`, suppliers nodes
 *     `code description dbId`; an empty connection answers `"edges": null`.
 *
 * The fake honours ONLY `first` and `after` on a connection and `dbId` on a
 * single-record root, refuses `first` above 10,000, and refuses (as GraphQL
 * validation would) any selected field the articles do not show. Each token
 * sees its own rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { XledgerAdapter } from '../../../../../../src/verticals/accounting/adapters/xledger/index'

const CREDS = { accessToken: 'xl-token' }
const OTHER = { accessToken: 'other-token' }

const adapter = new XledgerAdapter({ clientId: 'unused' })

// ── the fake upstream ────────────────────────────────────────────────────

type Row = Record<string, unknown> & { dbId: number }

interface Dataset {
  arTransactions?: Row[]
  apTransactions?: Row[]
  customers?: Row[]
  suppliers?: Row[]
}

interface Recorded {
  root: string
  first?: number
  after?: unknown
  dbId?: unknown
  auth: string
}

const DOCUMENTED: Record<string, string[]> = {
  arTransactions: [
    'dbId',
    'invoiceNumber',
    'invoiceRemaining',
    'invoiceAmount',
    'reconciled',
    'extIdentifier',
  ],
  apTransactions: [
    'dbId',
    'invoiceNumber',
    'invoiceRemaining',
    'invoiceAmount',
    'reconciled',
    'extIdentifier',
  ],
  customers: ['code', 'description', 'dbId', 'companyDbId'],
  suppliers: ['code', 'description', 'dbId'],
}
const SINGULAR: Record<string, string> = {
  arTransaction: 'arTransactions',
  apTransaction: 'apTransactions',
  customer: 'customers',
  supplier: 'suppliers',
}

/** `n` subledger rows; every `creditEvery`-th row (1-based) is a credit note. */
function subledger(n: number, creditEvery: number, from = 1000): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const credit = (i + 1) % creditEvery === 0
    return {
      dbId: from + i,
      invoiceNumber: credit ? `Credit note for ${from + i}` : `INV-${from + i}`,
      invoiceRemaining: '0.0000',
      invoiceAmount: credit ? '-50.0000' : '200.0000',
      reconciled: true,
      extIdentifier: String(from + i),
    }
  })
}

function registers(n: number, from: number, withCompany: boolean): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    code: `C${from + i}`,
    dbId: from + i,
    description: `Name ${from + i}`,
    ...(withCompany ? { companyDbId: 900000 + i } : {}),
  }))
}

function pick(row: Row, fields: string[]): Row {
  const out: Row = { dbId: row.dbId }
  for (const f of fields) if (f in row) out[f] = row[f]
  return out
}

const CONNECTION =
  /^query \(\$after: String\) \{ (\w+)\(first: (\d+), after: \$after\) \{ edges \{ cursor node \{ ([^}]*) \} \} pageInfo \{ hasNextPage \} \} \}$/
const RECORD = /^query \(\$dbId: ID\) \{ (\w+)\(dbId: \$dbId\) \{ ([^}]*) \} \}$/

function install(data: Dataset, other: Dataset = {}): Recorded[] {
  const requests: Recorded[] = []
  const answer = (auth: string, query: string, variables: Record<string, unknown>) => {
    const set = auth === `token ${CREDS.accessToken}` ? data : other
    const conn = CONNECTION.exec(query)
    if (conn) {
      const [, root, firstText, selection] = conn as unknown as [string, string, string, string]
      const first = Number(firstText)
      requests.push({ root, first, after: variables['after'], auth })
      const fields = selection.trim().split(/\s+/)
      const bad = fields.filter((f) => !DOCUMENTED[root]?.includes(f))
      if (!DOCUMENTED[root] || bad.length)
        return { errors: [{ message: `Cannot query field ${bad.join(',') || root}` }] }
      if (first > 10_000) return { errors: [{ message: 'limit of 10000 records per query' }] }
      const rows = set[root as keyof Dataset] ?? []
      let start = 0
      const after = variables['after']
      if (after != null) {
        const i = rows.findIndex((r) => String(r.dbId) === after)
        if (i < 0) return { errors: [{ message: `unknown cursor ${String(after)}` }] }
        start = i + 1
      }
      const slice = rows.slice(start, start + first)
      return {
        data: {
          [root]: {
            edges: slice.length
              ? slice.map((r) => ({ cursor: String(r.dbId), node: pick(r, fields) }))
              : null,
            pageInfo: { hasNextPage: start + first < rows.length },
          },
        },
      }
    }
    const rec = RECORD.exec(query)
    if (rec) {
      const [, root, selection] = rec as unknown as [string, string, string]
      requests.push({ root, dbId: variables['dbId'], auth })
      const list = SINGULAR[root]
      const fields = selection.trim().split(/\s+/)
      if (!list || fields.some((f) => !DOCUMENTED[list]!.includes(f)))
        return { errors: [{ message: `Cannot query field on ${root}` }] }
      const row = (set[list as keyof Dataset] ?? []).find(
        (r) => String(r.dbId) === String(variables['dbId']),
      )
      return { data: { [root]: row ? pick(row, fields) : null } }
    }
    throw new Error(`fake upstream: unrecognised query ${query}`)
  }
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const auth = String(config?.headers?.['Authorization'])
    const post = async (
      _url: string,
      body: { query: string; variables?: Record<string, unknown> },
    ) => ({ data: answer(auth, body.query, body.variables ?? {}) })
    return { post }
  }) as unknown as typeof axios.create)
  return requests
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── driving the adapter like the worker ──────────────────────────────────

type Lister = (creds: typeof CREDS, params: QueryParams) => Promise<Array<{ id?: string }>>

async function walk(list: Lister, limit: number, creds = CREDS) {
  const pages: Array<{ ids: string[]; hasMore: boolean | undefined }> = []
  for (let page = 1; page < 1000; page++) {
    const params = withPageSink({ page, limit })
    const rows = await list(creds, params)
    const hasMore = readUpstreamPage(params)?.hasMore
    pages.push({ ids: rows.map((r) => String(r.id)), hasMore })
    if (!hasMore) break
  }
  return pages
}

const listInvoices: Lister = (c, p) => adapter.listInvoices(c, p)
const listBills: Lister = (c, p) => adapter.listBills(c, p)
const listCreditMemos: Lister = (c, p) => adapter.listCreditMemos(c, p)
const listContacts: Lister = (c, p) => adapter.listContacts(c, p)

describe('Xledger capabilities', () => {
  it('declares the documented 10,000-row page maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(10_000)
  })
})

describe('listInvoices (arTransactions, positive invoiceAmount)', () => {
  it('walks N = 2L+1 invoices at L = 3: every invoice once, credit notes never, hasMore exact', async () => {
    // 7 invoices; every 3rd AR row is a credit note, so 10 AR rows in all.
    const ar = subledger(10, 3)
    install({ arTransactions: ar })
    const pages = await walk(listInvoices, 3)
    expect(pages.map((p) => p.ids.length)).toEqual([3, 3, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.ids)
    const invoices = ar.filter((r) => String(r['invoiceAmount']).startsWith('2'))
    expect(ids).toEqual(invoices.map((r) => String(r.dbId)))
    expect(new Set(ids).size).toBe(7)
  })

  it('sends the documented request: first 10000, after = the last edge cursor, only documented fields', async () => {
    const requests = install({ arTransactions: subledger(10, 3) })
    const params = withPageSink({ page: 1, limit: 3 })
    await adapter.listInvoices(CREDS, params)
    expect(requests).toEqual([
      { root: 'arTransactions', first: 10_000, after: null, auth: 'token xl-token' },
    ])
  })

  it('crosses upstream pages of uneven yield: every invoice once across 10,007 AR rows', async () => {
    const ar = subledger(10_007, 3)
    const requests = install({ arTransactions: ar })
    const pages = await walk(listInvoices, 3_000)
    const invoices = ar.filter((r) => !String(r['invoiceAmount']).startsWith('-'))
    expect(invoices.length).toBe(6_672)
    expect(pages.map((p) => p.ids.length)).toEqual([3_000, 3_000, 672])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.ids)
    expect(ids).toEqual(invoices.map((r) => String(r.dbId)))
    // Two upstream pages: the second starts after the first page's last edge.
    const arRequests = requests.filter((r) => r.root === 'arTransactions')
    expect(arRequests.map((r) => r.after)).toContain(String(ar[9_999]!.dbId))
    expect(new Set(arRequests.map((r) => r.after))).toEqual(
      new Set([null, String(ar[9_999]!.dbId)]),
    )
  })

  it('an empty register ("edges": null) is an empty last page', async () => {
    install({ arTransactions: [] })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await adapter.listInvoices(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it("each connection sees its own rows, even mid-walk: another token's page 2 never comes from my rows", async () => {
    // My page 1 leaves my upstream page in the row pager's slot, half served.
    // A page 2 under another token must fetch under that token, not reuse it.
    const requests = install(
      { arTransactions: subledger(4, 100) },
      { arTransactions: subledger(4, 100, 5000) },
    )
    const mine1 = await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 2 }))
    const theirs2 = await adapter.listInvoices(OTHER, withPageSink({ page: 2, limit: 2 }))
    const mine2 = await adapter.listInvoices(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(mine1.map((r) => r.id)).toEqual(['1000', '1001'])
    expect(theirs2.map((r) => r.id)).toEqual(['5002', '5003'])
    expect(mine2.map((r) => r.id)).toEqual(['1002', '1003'])
    expect(requests.map((r) => r.auth)).toEqual(['token xl-token', 'token other-token'])
  })

  it('invoices and credit memos keep separate walks over the same arTransactions', async () => {
    // Every 2nd AR row is a credit note. My invoice page 1 leaves invoice rows
    // in the slot; a credit-memo page 2 must never be cut from them.
    install({ arTransactions: subledger(8, 2) })
    const inv1 = await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 2 }))
    const cm2 = await adapter.listCreditMemos(CREDS, withPageSink({ page: 2, limit: 2 }))
    const inv2 = await adapter.listInvoices(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(inv1.map((r) => r.id)).toEqual(['1000', '1002'])
    expect(cm2.map((r) => r.id)).toEqual(['1005', '1007'])
    expect(inv2.map((r) => r.id)).toEqual(['1004', '1006'])
  })

  it('an AR row whose invoiceAmount is zero or absent is neither an invoice nor a credit memo', async () => {
    install({
      arTransactions: [
        { dbId: 1, invoiceNumber: 'Z', invoiceAmount: '0.0000' },
        { dbId: 2, invoiceNumber: 'N', invoiceAmount: null },
        { dbId: 3, invoiceNumber: 'A', invoiceAmount: '200.0000' },
        { dbId: 4, invoiceNumber: 'B1', invoiceAmount: '-200.0000' },
      ],
    })
    const inv = await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 10 }))
    const cm = await adapter.listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(inv.map((r) => r.id)).toEqual(['3'])
    expect(cm.map((r) => r.id)).toEqual(['4'])
    await expect(adapter.getInvoice(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getCreditMemo(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('serves 50 rows when the caller names no limit', async () => {
    install({ arTransactions: subledger(120, 1000) })
    const params = withPageSink({ page: 1 })
    const rows = await adapter.listInvoices(CREDS, params)
    expect(rows).toHaveLength(50)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('getInvoice reads arTransaction(dbId:) and refuses a credit note id as an invoice', async () => {
    const requests = install({ arTransactions: subledger(3, 3) })
    const inv = await adapter.getInvoice(CREDS, '1000')
    expect(inv.id).toBe('1000')
    expect(inv.invoiceNumber).toBe('INV-1000')
    expect(requests.at(-1)).toMatchObject({ root: 'arTransaction', dbId: '1000' })
    await expect(adapter.getInvoice(CREDS, '1002')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getInvoice(CREDS, '42')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('listCreditMemos (arTransactions, negative invoiceAmount)', () => {
  it('walks N = 2L+1 credit notes at L = 2 out of interleaved AR rows, hasMore exact', async () => {
    // 5 credit notes among 10 AR rows (every 2nd).
    const ar = subledger(10, 2)
    install({ arTransactions: ar })
    const pages = await walk(listCreditMemos, 2)
    expect(pages.map((p) => p.ids.length)).toEqual([2, 2, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(['1001', '1003', '1005', '1007', '1009'])
  })

  it('getCreditMemo reads arTransaction(dbId:) and refuses an invoice id', async () => {
    install({ arTransactions: subledger(2, 2) })
    expect((await adapter.getCreditMemo(CREDS, '1001')).creditmemoNumber).toBe(
      'Credit note for 1001',
    )
    await expect(adapter.getCreditMemo(CREDS, '1000')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('listBills (apTransactions, positive invoiceAmount)', () => {
  it('walks N = 2L+1 bills at L = 3 from apTransactions only, hasMore exact', async () => {
    const ap = subledger(10, 3, 7000)
    const requests = install({ apTransactions: ap, arTransactions: subledger(10, 3) })
    const pages = await walk(listBills, 3)
    expect(pages.map((p) => p.ids.length)).toEqual([3, 3, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(
      ap.filter((r) => !String(r['invoiceAmount']).startsWith('-')).map((r) => String(r.dbId)),
    )
    expect(new Set(requests.map((r) => r.root))).toEqual(new Set(['apTransactions']))
  })

  it('getBill reads apTransaction(dbId:)', async () => {
    const requests = install({ apTransactions: subledger(1, 5, 7000) })
    expect((await adapter.getBill(CREDS, '7000')).billNumber).toBe('INV-7000')
    expect(requests.at(-1)).toMatchObject({ root: 'apTransaction', dbId: '7000' })
  })
})

describe('listContacts (customers, then suppliers)', () => {
  it('walks N = 2L+1 contacts at L = 3 across the two registers, hasMore exact', async () => {
    install({ customers: registers(4, 100, true), suppliers: registers(3, 200, false) })
    const pages = await walk(listContacts, 3)
    expect(pages.map((p) => p.ids)).toEqual([
      ['cust_100', 'cust_101', 'cust_102'],
      ['cust_103', 'supp_200', 'supp_201'],
      ['supp_202'],
    ])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('crosses upstream pages of the customer register, then reads suppliers from their start', async () => {
    const customers = registers(10_002, 100_000, true)
    const requests = install({ customers, suppliers: registers(2, 200, false) })
    const pages = await walk(listContacts, 5_000)
    expect(pages.map((p) => p.ids.length)).toEqual([5_000, 5_000, 4])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.ids)
    expect(new Set(ids).size).toBe(10_004)
    expect(ids.slice(-2)).toEqual(['supp_200', 'supp_201'])
    expect(requests.map((r) => [r.root, r.after])).toEqual([
      ['customers', null],
      ['customers', String(customers[9_999]!.dbId)],
      ['suppliers', null],
    ])
  })

  it('an empty customer register goes straight to the suppliers', async () => {
    install({ customers: [], suppliers: registers(2, 200, false) })
    const pages = await walk(listContacts, 5)
    expect(pages).toEqual([{ ids: ['supp_200', 'supp_201'], hasMore: false }])
  })

  it('getContact reads customer(dbId:) or supplier(dbId:) by the id prefix', async () => {
    const requests = install({
      customers: registers(1, 100, true),
      suppliers: registers(1, 100, false),
    })
    const c = await adapter.getContact(CREDS, 'cust_100')
    expect(c).toMatchObject({ id: 'cust_100', isCustomer: true })
    expect(requests.at(-1)).toMatchObject({ root: 'customer', dbId: '100' })
    const s = await adapter.getContact(CREDS, 'supp_100')
    expect(s).toMatchObject({ id: 'supp_100', isSupplier: true })
    expect(requests.at(-1)).toMatchObject({ root: 'supplier', dbId: '100' })
  })

  it('getContact answers 404 when the register has no such dbId', async () => {
    install({ customers: registers(1, 100, true), suppliers: [] })
    await expect(adapter.getContact(CREDS, 'cust_999')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getContact(CREDS, 'supp_100')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getContact refuses an id with no register prefix without sending anything', async () => {
    const requests = install({ customers: registers(1, 100, true) })
    await expect(adapter.getContact(CREDS, '100')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getContact(CREDS, 'cust_')).rejects.toMatchObject({ statusCode: 404 })
    expect(requests).toEqual([])
  })
})

describe('malformed connections are errors, never an empty, complete list', () => {
  /** Answer every POST with `respond(after)`, counting the requests. */
  function installRaw(respond: (after: unknown) => unknown): { calls: number } {
    const seen = { calls: 0 }
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      post: async (_url: string, body: { variables?: Record<string, unknown> }) => {
        seen.calls++
        return { data: respond(body.variables?.['after']) }
      },
    })) as unknown as typeof axios.create)
    return seen
  }

  it('a response with no connection throws, for the subledger lists and contacts', async () => {
    installRaw(() => ({ data: {} }))
    const params = withPageSink({ page: 1, limit: 5 })
    await expect(adapter.listInvoices(CREDS, params)).rejects.toThrow(
      /carried no arTransactions connection/,
    )
    await expect(adapter.listBills(CREDS, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /carried no apTransactions connection/,
    )
    await expect(adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /carried no customers connection/,
    )
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('hasNextPage true on a page with no edges throws instead of ending the list', async () => {
    installRaw(() => ({
      data: { arTransactions: { edges: null, pageInfo: { hasNextPage: true } } },
    }))
    await expect(adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /hasNextPage is true on a page with no edges/,
    )
  })

  it('a next cursor that names the page it came from throws instead of looping', async () => {
    // Page 1 ends at cursor "1"; the page fetched after "1" ends at "1" again.
    const seen = installRaw((after) => ({
      data: {
        arTransactions: {
          edges: [
            {
              cursor: '1',
              node: { dbId: after == null ? 1 : 2, invoiceAmount: '200.0000' },
            },
          ],
          pageInfo: { hasNextPage: true },
        },
      },
    }))
    await expect(adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(
      /names itself as the next page/,
    )
    expect(seen.calls).toBe(2)
  })
})
