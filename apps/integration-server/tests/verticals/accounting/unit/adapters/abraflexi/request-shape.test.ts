/**
 * AbraFlexi list paging: 1-based `page` + caller's `limit` → AbraFlexi's
 * `start` (a 0-based row offset) + `limit` on every list evidence.
 *
 * https://podpora.flexibee.eu/en/articles/4722193-pagination
 *   limit: "Maximum number of records per page. The default is 20. The value 0
 *           returns all records without limit."
 *   start: "How many records to skip. It is independent of the limit parameter."
 * https://podpora.flexibee.eu/en/articles/4719623-url-parameters
 *   "You must also use the start parameter, which specifies the record number
 *    at which the page begins. The first record and the default value is
 *    start=0."
 *
 * No maximum page size is documented, so none is clamped to (the adapter's old
 * cap of 100 was undocumented, and silently truncated the sync's 500-row pages).
 * `limit=0` means "every record", so a non-positive limit is never forwarded.
 *
 * Evidences are checked against the vendor's own list
 * (https://demo.flexibee.eu/c/demo/evidence-list.json): `objednavka-prijata`
 * is "Přijaté objednávky" (OBJEDNAVKA_IN, orders your customers place: sales
 * orders), `objednavka-vydana` is "Vydané objednávky" (OBJEDNAVKA_OUT, orders
 * you place with suppliers: purchase orders), and the company's chart of
 * accounts is `ucet` ("Účtový rozvrh"), not the statutory template
 * `ucetni-osnova` ("Standardní účetní osnova").
 *
 * `listCreditMemos` is deliberately not covered: it reads `dobropis`, which is
 * not an AbraFlexi evidence (absent from the vendor's evidence list, 404 on
 * the vendor's demo instance), so a paging fix there would be vacuous.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { AbraflexiAdapter } from '../../../../../../src/verticals/accounting/adapters/abraflexi/index'

// The shape the Connect form stores. NOTE: client.ts does not read
// `extra.instanceUrl` or the password yet: it sends every request to the
// hard-coded ABRAFLEXI_API_BASE with a Bearer header (a pre-existing connection
// defect, tracked apart from paging). axios is faked below, so these tests pin
// only the evidence path and the query each method sends, never the host.
const CREDS = {
  accessToken: 'user',
  extra: { password: 'pw', instanceUrl: 'https://abraflexi.example.test/c/demo' },
}
const DOCUMENTED_DEFAULT_LIMIT = 20
const ADAPTER_DEFAULT_LIMIT = 50

/**
 * Parse one paging parameter as the vendor does. axios drops an undefined
 * value; anything that is not a whole number is refused with the demo
 * instance's own 400 message (observed for `limit=2.5` and `start=1.5`).
 */
function intParam(params: Record<string, unknown>, name: string): number | undefined {
  const raw = params[name]
  if (raw === undefined || raw === null) return undefined
  const text = String(raw)
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`400: It is expected numeric value for parameter '${name}'.`)
  }
  return Number(text)
}

/**
 * A fake AbraFlexi that honours ONLY the documented paging parameters: `start`
 * (records to skip, default 0) and `limit` (records per page, default 20, 0 =
 * all). Any other query parameter or another evidence is refused, so a request
 * that depends on anything else fails loudly. What the docs leave open follows
 * the vendor's demo instance (demo.flexibee.eu, checked 2026-09-23): a
 * negative `start` reads as 0 and a negative `limit` returns every record.
 */
function fakeAbraflexi(evidence: string, total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (path !== evidence) throw new Error(`404: ${path} is not the ${evidence} evidence`)
    const params = cfg?.params ?? {}
    for (const key of Object.keys(params)) {
      if (key !== 'start' && key !== 'limit') throw new Error(`unexpected parameter ${key}`)
    }
    const start = Math.max(intParam(params, 'start') ?? 0, 0)
    const limit = intParam(params, 'limit') ?? DOCUMENTED_DEFAULT_LIMIT
    const rows = limit <= 0 ? all.slice(start) : all.slice(start, start + limit)
    return { data: { winstrom: { '@version': '1.0', [evidence]: rows } } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type ListCall = (a: AbraflexiAdapter, p: QueryParams) => Promise<Array<{ id?: string }>>

const METHODS: ReadonlyArray<{ name: string; evidence: string; call: ListCall }> = [
  { name: 'listInvoices', evidence: 'faktura-vydana', call: (a, p) => a.listInvoices(CREDS, p) },
  { name: 'listBills', evidence: 'faktura-prijata', call: (a, p) => a.listBills(CREDS, p) },
  { name: 'listContacts', evidence: 'adresar', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listAccounts', evidence: 'ucet', call: (a, p) => a.listAccounts(CREDS, p) },
  { name: 'listJournals', evidence: 'interni-doklad', call: (a, p) => a.listJournals(CREDS, p) },
  { name: 'listTransactions', evidence: 'banka', call: (a, p) => a.listTransactions(CREDS, p) },
  { name: 'listTaxRates', evidence: 'sazba-dph', call: (a, p) => a.listTaxRates(CREDS, p) },
  { name: 'listExpenses', evidence: 'faktura-prijata', call: (a, p) => a.listExpenses(CREDS, p) },
  { name: 'listOrders', evidence: 'objednavka-prijata', call: (a, p) => a.listOrders(CREDS, p) },
  {
    name: 'listSalesOrders',
    evidence: 'objednavka-prijata',
    call: (a, p) => a.listSalesOrders(CREDS, p),
  },
  {
    name: 'listPurchaseOrders',
    evidence: 'objednavka-vydana',
    call: (a, p) => a.listPurchaseOrders(CREDS, p),
  },
]

afterEach(() => vi.restoreAllMocks())

describe.each(METHODS)('abraflexi $name paging ($evidence)', ({ evidence, call }) => {
  const run = async (params: QueryParams) =>
    (await call(new AbraflexiAdapter(), params)).map((r) => r.id)
  const query = (q: Record<string, string>) => run(parseListQuery(q))

  it('page 1 returns the first rows and asks for start=0', async () => {
    const { get } = fakeAbraflexi(evidence, 100)
    expect(await query({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(evidence, { params: { start: 0, limit: 10 } })
  })

  it('page 2 returns the next rows and asks for start=10', async () => {
    const { get } = fakeAbraflexi(evidence, 100)
    expect(await query({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 10, limit: 10 } })
  })

  it('a missing page returns the first rows', async () => {
    const { get } = fakeAbraflexi(evidence, 100)
    expect(await query({ limit: '10' })).toEqual(ids(1, 10))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 0, limit: 10 } })
  })

  it.each([0, -3, Number.NaN])('a direct page %s is treated as page 1', async (page) => {
    const { get } = fakeAbraflexi(evidence, 100)
    expect(await run({ page, limit: 10 })).toEqual(ids(1, 10))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 0, limit: 10 } })
  })

  it('no maximum is documented: a limit of 250 is sent as-is and page 2 strides by it', async () => {
    const { get } = fakeAbraflexi(evidence, 600)
    expect(await query({ page: '1', limit: '250' })).toEqual(ids(1, 250))
    expect(await query({ page: '2', limit: '250' })).toEqual(ids(251, 250))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { start: 0, limit: 250 } },
      { params: { start: 250, limit: 250 } },
    ])
  })

  it("a limit above the router's max (500) is clamped by parseListQuery and page 2 strides by 500", async () => {
    const { get } = fakeAbraflexi(evidence, 1200)
    expect(await query({ page: '2', limit: '9999' })).toEqual(ids(501, 500))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 500, limit: 500 } })
  })

  it('a direct limit above 500 is not clamped by the adapter, and page 2 strides by it', async () => {
    const { get } = fakeAbraflexi(evidence, 2500)
    expect(await run({ page: 2, limit: 1000 })).toEqual(ids(1001, 1000))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 1000, limit: 1000 } })
  })

  it('a direct call without a limit keeps the adapter default (50) and strides by it', async () => {
    const { get } = fakeAbraflexi(evidence, 200)
    expect(await run({})).toEqual(ids(1, ADAPTER_DEFAULT_LIMIT))
    expect(await run({ page: 2 })).toEqual(ids(51, ADAPTER_DEFAULT_LIMIT))
    expect(get.mock.calls.map((c) => c[1])).toEqual([
      { params: { start: 0, limit: 50 } },
      { params: { start: 50, limit: 50 } },
    ])
  })

  // AbraFlexi reads limit=0 as "all records" (documented) and a negative limit
  // the same way (observed on the demo); NaN and Infinity are a 400 there.
  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    'never forwards a direct limit of %s: the adapter default (50) is sent and strides page 2',
    async (limit) => {
      const { get } = fakeAbraflexi(evidence, 200)
      expect(await run({ page: 2, limit })).toEqual(ids(51, ADAPTER_DEFAULT_LIMIT))
      expect(get.mock.calls[0]![1]).toEqual({ params: { start: 50, limit: 50 } })
    },
  )

  it('a fractional direct limit is floored to a whole page size, and page 2 strides by it', async () => {
    const { get } = fakeAbraflexi(evidence, 100)
    expect(await run({ page: 2, limit: 2.5 })).toEqual(ids(3, 2))
    expect(get.mock.calls[0]![1]).toEqual({ params: { start: 2, limit: 2 } })
  })

  // SyncWorker's page size is config.pageSize (default 500), capped only by a
  // declared capabilities.maxPageSize, so a walk above 500 is reachable too.
  it.each([10, 7, 500, 1000])(
    'a sync-style walk at limit %i returns all 2L+1 rows in order, once each',
    async (limit) => {
      const total = 2 * limit + 1
      const { get } = fakeAbraflexi(evidence, total)
      const seen: Array<string | undefined> = []
      for (let page = 1; page <= 10; page++) {
        const rows = await run(withPageSink({ page, limit }))
        seen.push(...rows)
        if (rows.length < limit) break
      }
      expect(seen).toEqual(ids(1, total))
      expect(get).toHaveBeenCalledTimes(3)
    },
  )
})

type GetCall = (a: AbraflexiAdapter, id: string) => Promise<{ id?: string }>

// Each get must read the evidence its list pages, or a listed id is looked up
// in another evidence's id space.
const GETS: ReadonlyArray<{ name: string; evidence: string; call: GetCall }> = [
  { name: 'getInvoice', evidence: 'faktura-vydana', call: (a, id) => a.getInvoice(CREDS, id) },
  { name: 'getBill', evidence: 'faktura-prijata', call: (a, id) => a.getBill(CREDS, id) },
  { name: 'getContact', evidence: 'adresar', call: (a, id) => a.getContact(CREDS, id) },
  { name: 'getAccount', evidence: 'ucet', call: (a, id) => a.getAccount(CREDS, id) },
  { name: 'getJournal', evidence: 'interni-doklad', call: (a, id) => a.getJournal(CREDS, id) },
  { name: 'getTransaction', evidence: 'banka', call: (a, id) => a.getTransaction(CREDS, id) },
  { name: 'getTaxRate', evidence: 'sazba-dph', call: (a, id) => a.getTaxRate(CREDS, id) },
  { name: 'getExpense', evidence: 'faktura-prijata', call: (a, id) => a.getExpense(CREDS, id) },
  { name: 'getOrder', evidence: 'objednavka-prijata', call: (a, id) => a.getOrder(CREDS, id) },
  {
    name: 'getSalesOrder',
    evidence: 'objednavka-prijata',
    call: (a, id) => a.getSalesOrder(CREDS, id),
  },
  {
    name: 'getPurchaseOrder',
    evidence: 'objednavka-vydana',
    call: (a, id) => a.getPurchaseOrder(CREDS, id),
  },
]

describe.each(GETS)('abraflexi $name reads $evidence', ({ evidence, call }) => {
  it(`asks for ${evidence}/<id> and returns that record`, async () => {
    const get = vi.fn(async (path: string) => {
      if (path !== `${evidence}/7`) throw new Error(`404: ${path} is not ${evidence}/7`)
      return { data: { winstrom: { '@version': '1.0', [evidence]: [{ id: 7 }] } } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({
      get,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never)
    expect((await call(new AbraflexiAdapter(), '7')).id).toBe('7')
    expect(get).toHaveBeenCalledTimes(1)
  })
})
