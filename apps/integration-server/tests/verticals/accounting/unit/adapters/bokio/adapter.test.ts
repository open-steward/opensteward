/**
 * Bokio adapter over a mocked HTTP layer, against the documented shapes.
 *
 * Paged lists (https://docs.bokio.se/reference/get-invoice.md, get-customer.md,
 * get-journalentry.md, list-credit-notes-v1.md and the [Preview]
 * get-supplier-invoices.md): `page` (default 1) and
 * `pageSize` (default 25, maximum 100) in, `{ totalItems, totalPages,
 * currentPage, items }` out. The chart of accounts
 * (https://docs.bokio.se/reference/get-chart-of-accounts.md) is a plain array
 * with no paging parameters.
 *
 * The 2026-09-29 live sync failed with "(res ?? []).map is not a function" on
 * every paged list (the adapter expected a bare array) and with a NOT NULL
 * resource_id on accounts (the adapter read `accountNumber`, which does not
 * exist; the key is `account`). Both are pinned below.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { BokioAdapter } from '../../../../../../src/verticals/accounting/adapters/bokio/index'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { ContactSchema } from '../../../../../../src/verticals/accounting/schema/contact'
import { JournalSchema } from '../../../../../../src/verticals/accounting/schema/journal'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'
import { AccountSchema } from '../../../../../../src/verticals/accounting/schema/account'
import { OrganizationSchema } from '../../../../../../src/verticals/accounting/schema/organization'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'
import {
  ACCOUNT_WITH_DETAILS,
  CHART_OF_ACCOUNTS,
  COMPANY_INFORMATION,
  CREDIT_NOTE,
  CREDIT_NOTE_CREATED,
  CUSTOMER,
  FISCAL_YEAR,
  INVOICE,
  JOURNAL_ENTRY,
  SUPPLIER,
  SUPPLIER_CREATED,
  SUPPLIER_INVOICE,
  SUPPLIER_INVOICE_CREATED,
  SUPPLIER_INVOICE_UPDATED,
  SUPPLIER_INVOICES_PAGE,
  SUPPLIER_SCHEMA_EXAMPLE,
  SUPPLIER_UPDATED,
  copyOf,
} from './fixtures'

const COMPANY = 'ea9ee4dd-fae3-4aec-a7db-6fc9cc1f8135'
const CREDS = { accessToken: 'tok', tenantId: COMPANY }

interface Call {
  method: string
  path: string
  params?: Record<string, unknown>
  body?: unknown
}

type Responder = (call: Call) => unknown

/** Replace axios.create; every request is recorded and answered by `respond`. */
function fakeHttp(respond: Responder): { calls: Call[] } {
  const calls: Call[] = []
  const handle = async (call: Call) => {
    calls.push(call)
    const data = respond(call)
    if (data instanceof Error) throw data
    return { data }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: (path: string, cfg?: { params?: Record<string, unknown> }) =>
      handle({ method: 'GET', path, params: cfg?.params }),
    post: (path: string, body: unknown) => handle({ method: 'POST', path, body }),
    put: (path: string, body: unknown) => handle({ method: 'PUT', path, body }),
    delete: (path: string) => handle({ method: 'DELETE', path }),
  } as never)
  return { calls }
}

const adapter = () => new BokioAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

/** Rows with distinct ids, built from one documented row. */
function rowsOf<T extends { id: string }>(fixture: unknown, n: number, from = 1): T[] {
  return Array.from({ length: n }, (_, i) => ({ ...copyOf<T>(fixture), id: `row-${from + i}` }))
}

/**
 * An upstream of `total` rows served in the documented envelope at whatever
 * `pageSize` is asked, answering `path` only.
 */
function pagedUpstream<T extends { id: string }>(path: string, fixture: unknown, total: number) {
  const all = rowsOf<T>(fixture, total)
  return fakeHttp((call) => {
    if (call.method !== 'GET' || call.path !== `companies/${COMPANY}/${path}`) {
      return new Error(`unexpected ${call.method} ${call.path}`)
    }
    const page = Number(call.params?.page ?? 1)
    const size = Number(call.params?.pageSize ?? 25)
    return {
      totalItems: total,
      totalPages: Math.ceil(total / size),
      currentPage: page,
      items: all.slice((page - 1) * size, page * size),
    }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

/** The error axios throws on Bokio's documented 404 ("not-found"). */
function notFound(): Error {
  return Object.assign(new Error('Request failed with status code 404'), {
    response: { status: 404, data: { code: 'not-found' } },
  })
}

/** Bokio's 403 on a request the token has no scope for. */
function forbidden(): Error {
  return Object.assign(new Error('Request failed with status code 403'), {
    response: { status: 403 },
  })
}

function serverError(): Error {
  return Object.assign(new Error('Request failed with status code 500'), {
    response: { status: 500 },
  })
}

const PAGED = [
  { method: 'listInvoices', path: 'invoices', fixture: INVOICE, schema: InvoiceSchema },
  {
    method: 'listJournals',
    path: 'journal-entries',
    fixture: JOURNAL_ENTRY,
    schema: JournalSchema,
  },
  {
    method: 'listCreditMemos',
    path: 'credit-notes',
    fixture: CREDIT_NOTE,
    schema: CreditMemoSchema,
  },
  {
    method: 'listBills',
    path: 'supplier-invoices',
    fixture: SUPPLIER_INVOICE,
    schema: BillSchema,
  },
] as const

type PagedMethod = (typeof PAGED)[number]['method']
const list = (m: PagedMethod, params: QueryParams) =>
  (adapter()[m] as (c: typeof CREDS, p: QueryParams) => Promise<Array<{ id?: string }>>)(
    CREDS,
    params,
  )

describe.each(PAGED)(
  'bokio $method (GET $path, paged envelope)',
  ({ method, path, fixture, schema }) => {
    it('walks a 2-page envelope: every row once, totals and hasMore as Bokio reports them', async () => {
      const { calls } = pagedUpstream(path, fixture, 3)
      const seen: string[] = []
      const meta = []
      for (const page of [1, 2]) {
        const params = withPageSink({ page, limit: 2 })
        const rows = await list(method, params)
        rows.forEach((r) => schema.parse(r))
        seen.push(...rows.map((r) => r.id!))
        meta.push(readUpstreamPage(params))
      }
      expect(seen).toEqual(['row-1', 'row-2', 'row-3'])
      expect(calls.map((c) => c.params)).toEqual([
        { page: 1, pageSize: 2 },
        { page: 2, pageSize: 2 },
      ])
      expect(meta).toEqual([
        { totalCount: 3, totalPages: 2, currentPage: 1, hasMore: true, pageSize: 2 },
        { totalCount: 3, totalPages: 2, currentPage: 2, hasMore: false, pageSize: 2 },
      ])
    })

    it('answers an empty items array with no rows and no more pages', async () => {
      fakeHttp(() => ({ totalItems: 0, totalPages: 0, currentPage: 1, items: [] }))
      const params = withPageSink({ page: 1, limit: 25 })
      expect(await list(method, params)).toEqual([])
      expect(readUpstreamPage(params)).toMatchObject({ totalCount: 0, hasMore: false })
    })

    it('asks for at most the documented pageSize of 100 when the router asks for 500', async () => {
      const { calls } = pagedUpstream(path, fixture, 0)
      const params = withPageSink(parseListQuery({ limit: '500' }, adapter()))
      expect(params.limit).toBe(100)
      await list(method, params)
      expect(calls[0]!.params).toEqual({ page: 1, pageSize: 100 })
    })

    it('reports the clamped size on a direct call past the maximum', async () => {
      const { calls } = pagedUpstream(path, fixture, 0)
      const params = withPageSink({ page: 1, limit: 500 })
      await list(method, params)
      expect(calls[0]!.params).toEqual({ page: 1, pageSize: 100 })
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
    })

    it('does not forward updatedAfter: Bokio documents no modification filter to send it as', async () => {
      const { calls } = pagedUpstream(path, fixture, 1)
      const rows = await list(
        method,
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date() }),
      )
      expect(rows).toHaveLength(1)
      expect(calls[0]!.params).toEqual({ page: 1, pageSize: 10 })
    })

    it('reads rows under `result`, the key of the Pagination page example (pagination.md)', async () => {
      const row = { ...copyOf<{ id: string }>(fixture), id: 'r-1' }
      fakeHttp(() => ({ result: [row], totalItems: 1, totalPages: 1, currentPage: 1 }))
      const params = withPageSink({ page: 1, limit: 10 })
      const rows = await list(method, params)
      expect(rows.map((r) => schema.parse(r).id)).toEqual(['r-1'])
      expect(readUpstreamPage(params)).toMatchObject({ totalCount: 1, hasMore: false })
    })

    it('rejects a body that is not the documented envelope with a 502, not a TypeError', async () => {
      fakeHttp(() => [copyOf(fixture)])
      await expect(list(method, withPageSink({ page: 1, limit: 10 }))).rejects.toMatchObject({
        statusCode: 502,
      })
    })
  },
)

describe('bokio listAccounts (GET chart-of-accounts, plain array)', () => {
  it('maps the documented array with the id taken from "account" as a string', async () => {
    const { calls } = fakeHttp(() => copyOf(CHART_OF_ACCOUNTS))
    const params = withPageSink({ page: 1, limit: 100 })
    const rows = await adapter().listAccounts(CREDS, params)
    rows.forEach((r) => AccountSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['1930', '3001', '8001'])
    expect(calls).toEqual([
      { method: 'GET', path: `companies/${COMPANY}/chart-of-accounts`, params: undefined },
    ])
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 3,
      hasMore: false,
      pagedLocally: true,
    })
  })

  it('pages the whole chart locally: every account once across caller pages', async () => {
    fakeHttp(() => copyOf(CHART_OF_ACCOUNTS))
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await adapter().listAccounts(CREDS, params)).map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1930', '3001', '8001'])
    expect(more).toEqual([true, false])
  })

  it('fails the list with a 502 rather than store an account without "account" (no id)', async () => {
    const [first, ...rest] = copyOf<Array<Record<string, unknown>>>(CHART_OF_ACCOUNTS)
    const { account, ...withoutAccount } = first!
    fakeHttp(() => [{ ...withoutAccount, accountNumber: account }, ...rest])
    await expect(
      adapter().listAccounts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it('rejects a non-array body with a 502', async () => {
    fakeHttp(() => ({ items: [] }))
    await expect(
      adapter().listAccounts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('bokio get-by-id (documented single-resource shapes)', () => {
  it.each([
    ['getInvoice', 'a419cf69-db6f-4de9-992c-b1a60942a443', 'invoices', INVOICE, InvoiceSchema],
    ['getContact', '55c899c5-82b2-47fa-9c51-e35fc9b26443', 'customers', CUSTOMER, ContactSchema],
    [
      'getJournal',
      'a419cf69-db6f-4de9-992c-b1a60942a443',
      'journal-entries',
      JOURNAL_ENTRY,
      JournalSchema,
    ],
    [
      'getCreditMemo',
      'b529df79-eb7f-5ef0-a8dc-c2b71f953554',
      'credit-notes',
      CREDIT_NOTE,
      CreditMemoSchema,
    ],
    [
      'getBill',
      '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90',
      'supplier-invoices',
      SUPPLIER_INVOICE,
      BillSchema,
    ],
    ['getAccount', '1930', 'chart-of-accounts', ACCOUNT_WITH_DETAILS, AccountSchema],
  ] as const)(
    '%s GETs %s/{id} and maps the bare object',
    async (method, id, path, fixture, schema) => {
      const { calls } = fakeHttp(() => copyOf(fixture))
      const get = adapter()[method] as (c: typeof CREDS, id: string) => Promise<{ id?: string }>
      const out = schema.parse(await get(CREDS, id))
      expect(out.id).toBe(id)
      expect(calls).toEqual([
        { method: 'GET', path: `companies/${COMPANY}/${path}/${id}`, params: undefined },
      ])
    },
  )

  it('getAccount maps accountBalance', async () => {
    fakeHttp(() => copyOf(ACCOUNT_WITH_DETAILS))
    expect((await adapter().getAccount(CREDS, '1930')).balance).toBe(1_500_075)
  })

  it('getOrganization GETs company-information and every fiscal year for fiscalYearEndMonth', async () => {
    const { calls } = fakeHttp((c) =>
      c.path.endsWith('/fiscal-years')
        ? { totalItems: 1, totalPages: 1, currentPage: 1, items: [copyOf(FISCAL_YEAR)] }
        : copyOf(COMPANY_INFORMATION),
    )
    const out = OrganizationSchema.parse(await adapter().getOrganization(CREDS))
    expect(out.name).toBe('Company AB')
    expect(out.fiscalYearEndMonth).toBe(12)
    expect(calls).toEqual([
      { method: 'GET', path: `companies/${COMPANY}/company-information`, params: undefined },
      {
        method: 'GET',
        path: `companies/${COMPANY}/fiscal-years`,
        params: { page: 1, pageSize: 100 },
      },
    ])
  })

  it('getOrganization walks every fiscal-years page and takes the latest endDate', async () => {
    const { calls } = fakeHttp((c) => {
      if (!c.path.endsWith('/fiscal-years')) return copyOf(COMPANY_INFORMATION)
      const page = Number(c.params?.page)
      const row = page === 1 ? { endDate: '2023-12-31' } : { endDate: '2025-06-30' }
      return {
        totalItems: 2,
        totalPages: 2,
        currentPage: page,
        items: [{ ...copyOf<object>(FISCAL_YEAR), ...row }],
      }
    })
    expect((await adapter().getOrganization(CREDS)).fiscalYearEndMonth).toBe(6)
    expect(calls.filter((c) => c.path.endsWith('/fiscal-years')).map((c) => c.params)).toEqual([
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
    ])
  })

  it('getOrganization serves the company without fiscalYearEndMonth on a fiscal-years 403, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fakeHttp((c) => (c.path.endsWith('/fiscal-years') ? forbidden() : copyOf(COMPANY_INFORMATION)))
    const out = OrganizationSchema.parse(await adapter().getOrganization(CREDS))
    expect(out.name).toBe('Company AB')
    expect(out.fiscalYearEndMonth).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('fiscal-years:read')
  })

  it('getOrganization still fails on a fiscal-years error other than 403', async () => {
    const boom = serverError()
    fakeHttp((c) => (c.path.endsWith('/fiscal-years') ? boom : copyOf(COMPANY_INFORMATION)))
    await expect(adapter().getOrganization(CREDS)).rejects.toBe(boom)
  })

  it('getContact treats a supplier 403 as not found among the customers, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missing = notFound()
    const { calls } = fakeHttp((c) => (c.path.includes('/customers/') ? missing : forbidden()))
    await expect(adapter().getContact(CREDS, 'x')).rejects.toBe(missing)
    expect(calls.map((c) => c.path)).toEqual([
      `companies/${COMPANY}/customers/x`,
      `companies/${COMPANY}/suppliers/x`,
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('suppliers:read')
  })

  it('getContact fails on a customers 403 without trying suppliers', async () => {
    const denied = forbidden()
    const { calls } = fakeHttp(() => denied)
    await expect(adapter().getContact(CREDS, 'x')).rejects.toBe(denied)
    expect(calls.map((c) => c.path)).toEqual([`companies/${COMPANY}/customers/x`])
  })

  it('getContact still fails on a supplier error other than 403', async () => {
    const boom = serverError()
    fakeHttp((c) => (c.path.includes('/customers/') ? notFound() : boom))
    await expect(adapter().getContact(CREDS, 'x')).rejects.toBe(boom)
  })

  it('getContact falls back to GET suppliers/{id} on the customer 404', async () => {
    const id = '12345678-abcd-1234-abcd-1234567890ab'
    const { calls } = fakeHttp((c) =>
      c.path.includes('/customers/') ? notFound() : copyOf(SUPPLIER),
    )
    const out = ContactSchema.parse(await adapter().getContact(CREDS, id))
    expect(out).toMatchObject({ id, isSupplier: true, isCustomer: false, name: 'Example Supplier' })
    expect(calls.map((c) => c.path)).toEqual([
      `companies/${COMPANY}/customers/${id}`,
      `companies/${COMPANY}/suppliers/${id}`,
    ])
  })

  it('getContact does not fall back on an error other than 404', async () => {
    const boom = Object.assign(new Error('500'), { response: { status: 500 } })
    const { calls } = fakeHttp(() => boom)
    await expect(adapter().getContact(CREDS, 'x')).rejects.toBe(boom)
    expect(calls).toHaveLength(1)
  })
})

describe('bokio writes', () => {
  it.each([
    ['createInvoice', () => adapter().createInvoice(CREDS, { currency: 'SEK' })],
    ['updateInvoice', () => adapter().updateInvoice(CREDS, 'inv', { currency: 'SEK' })],
    ['createContact', () => adapter().createContact(CREDS, { name: 'X' })],
  ] as const)('%s refuses with 501 NOT_SUPPORTED before any request', async (_m, call) => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('updateContact reads the customer, lays the canonical fields over it and PUTs it whole', async () => {
    const { calls } = fakeHttp((c) => (c.method === 'GET' ? copyOf(CUSTOMER) : c.body))
    const out = await adapter().updateContact(CREDS, '55c899c5-82b2-47fa-9c51-e35fc9b26443', {
      name: 'Renamed AB',
      taxNumber: 'SE999',
    })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET companies/${COMPANY}/customers/55c899c5-82b2-47fa-9c51-e35fc9b26443`,
      `PUT companies/${COMPANY}/customers/55c899c5-82b2-47fa-9c51-e35fc9b26443`,
    ])
    expect(calls[1]!.body).toMatchObject({
      name: 'Renamed AB',
      vatNumber: 'SE999',
      type: 'company',
      orgNumber: '123456-7890',
      contactsDetails: CUSTOMER.contactsDetails,
    })
    expect(ContactSchema.parse(out).name).toBe('Renamed AB')
  })

  it('updateContact lays a partial address over the current one, keeping required fields', async () => {
    const { calls } = fakeHttp((c) => (c.method === 'GET' ? copyOf(CUSTOMER) : c.body))
    await adapter().updateContact(CREDS, '55c899c5-82b2-47fa-9c51-e35fc9b26443', {
      billingAddress: { city: 'Malmö' },
    })
    expect((calls[1]!.body as { address: unknown }).address).toEqual({
      line1: 'Älvsborgsvägen 10',
      line2: null,
      city: 'Malmö',
      postalCode: '123 45',
      country: 'SE',
      countrySubdivision: null,
    })
  })

  it('updateContact refuses emails before any request', async () => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(
      adapter().updateContact(CREDS, 'c', { emails: [{ email: 'a@example.com' }] }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(calls).toEqual([])
  })

  it('deleteContact finds the customer, then DELETEs customers/{id}', async () => {
    const { calls } = fakeHttp((c) => (c.method === 'GET' ? copyOf(CUSTOMER) : undefined))
    await adapter().deleteContact(CREDS, 'cust-1')
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET companies/${COMPANY}/customers/cust-1`,
      `DELETE companies/${COMPANY}/customers/cust-1`,
    ])
  })

  it('createJournal POSTs the documented journalEntry body', async () => {
    const { calls } = fakeHttp(() => copyOf(JOURNAL_ENTRY))
    const out = await adapter().createJournal(CREDS, {
      description: 'invoice 1234',
      postedAt: '2024-10-10',
      lineItems: [
        { accountId: '1930', debitAmount: 20_000, creditAmount: 0 },
        { accountId: '3011', debitAmount: 0, creditAmount: 4_000 },
        { accountId: '2611', debitAmount: 0, creditAmount: 16_000 },
      ],
    })
    expect(calls).toEqual([
      {
        method: 'POST',
        path: `companies/${COMPANY}/journal-entries`,
        body: {
          title: 'invoice 1234',
          date: '2024-10-10',
          items: [
            { account: 1930, debit: 200, credit: 0 },
            { account: 3011, debit: 0, credit: 40 },
            { account: 2611, debit: 0, credit: 160 },
          ],
        },
      },
    ])
    expect(JournalSchema.parse(out).id).toBe('a419cf69-db6f-4de9-992c-b1a60942a443')
  })
})

describe('bokio bills (GET supplier-invoices, [Preview])', () => {
  it('serves the documented two-row list example as bills with their totals', async () => {
    const { calls } = fakeHttp(() => copyOf(SUPPLIER_INVOICES_PAGE))
    const params = withPageSink({ page: 1, limit: 25 })
    const rows = await adapter().listBills(CREDS, params)
    expect(rows.map((r) => BillSchema.parse(r).billNumber)).toEqual(['INV-001', 'INV-002'])
    expect(rows.map((r) => r.status)).toEqual(['AUTHORIZED', 'PARTIALLY_PAID'])
    expect(calls).toEqual([
      {
        method: 'GET',
        path: `companies/${COMPANY}/supplier-invoices`,
        params: { page: 1, pageSize: 25 },
      },
    ])
    expect(readUpstreamPage(params)).toEqual({
      totalCount: 2,
      totalPages: 1,
      currentPage: 1,
      hasMore: false,
      pageSize: 25,
    })
  })
})

describe('bokio listContacts (customers, then suppliers, as one stream)', () => {
  /**
   * `customers` customer rows and `suppliers` supplier rows, each served in
   * the documented envelope at whatever pageSize is asked. Supplier rows are
   * the get-suppliers.md schema example with distinct ids.
   */
  function twoCollections(customers: number, suppliers: number) {
    const rows = {
      customers: rowsOf<{ id: string }>(CUSTOMER, customers).map((r) => ({
        ...r,
        id: `cus-${r.id}`,
      })),
      suppliers: rowsOf<{ id: string }>(SUPPLIER_SCHEMA_EXAMPLE, suppliers).map((r) => ({
        ...r,
        id: `sup-${r.id}`,
      })),
    }
    return fakeHttp((call) => {
      const m = /^companies\/[^/]+\/(customers|suppliers)$/.exec(call.path)
      if (call.method !== 'GET' || !m) return new Error(`unexpected ${call.method} ${call.path}`)
      const all = rows[m[1] as 'customers' | 'suppliers']
      const page = Number(call.params?.page ?? 1)
      const size = Number(call.params?.pageSize ?? 25)
      return {
        totalItems: all.length,
        totalPages: Math.ceil(all.length / size),
        currentPage: page,
        items: all.slice((page - 1) * size, page * size),
      }
    })
  }

  async function walk(limit: number) {
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 20; page++) {
      const params = withPageSink({ page, limit })
      const rows = await adapter().listContacts(CREDS, params)
      rows.forEach((r) => ContactSchema.parse(r))
      ids.push(...rows.map((r) => r.id!))
      more.push(readUpstreamPage(params)?.hasMore)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    return { ids, more }
  }

  it('serves every customer, then every supplier, once, with hasMore exact', async () => {
    const { calls } = twoCollections(3, 2)
    const { ids, more } = await walk(2)
    expect(ids).toEqual(['cus-row-1', 'cus-row-2', 'cus-row-3', 'sup-row-1', 'sup-row-2'])
    expect(more).toEqual([true, true, false])
    expect(
      calls.map((c) => `${c.path.split('/').pop()} ${c.params?.page}/${c.params?.pageSize}`),
    ).toEqual(['customers 1/2', 'customers 2/2', 'suppliers 1/2'])
  })

  it('marks suppliers as suppliers and customers as customers', async () => {
    twoCollections(1, 1)
    const rows = await adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [r.id, r.isCustomer, r.isSupplier])).toEqual([
      ['cus-row-1', true, false],
      ['sup-row-1', false, true],
    ])
  })

  it('a page that ends on the last customer peeks at the suppliers for hasMore', async () => {
    twoCollections(2, 1)
    const params = withPageSink({ page: 1, limit: 2 })
    expect((await adapter().listContacts(CREDS, params)).map((r) => r.id)).toEqual([
      'cus-row-1',
      'cus-row-2',
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports no more rows when both collections are empty', async () => {
    twoCollections(0, 0)
    const params = withPageSink({ page: 1, limit: 25 })
    expect(await adapter().listContacts(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pagedLocally: true })
  })

  it('serves only suppliers when there are no customers', async () => {
    twoCollections(0, 3)
    const { ids } = await walk(2)
    expect(ids).toEqual(['sup-row-1', 'sup-row-2', 'sup-row-3'])
  })

  it('asks each collection for at most the documented pageSize of 100', async () => {
    const { calls } = twoCollections(0, 0)
    const params = withPageSink(parseListQuery({ limit: '500' }, adapter()))
    await adapter().listContacts(CREDS, params)
    expect(calls.map((c) => c.params)).toEqual([
      { page: 1, pageSize: 100 },
      { page: 1, pageSize: 100 },
    ])
  })

  /** `customers` customer rows, paged as documented; every supplier request answers `supplierError`. */
  function customersOnly(customers: number, supplierError: () => Error) {
    const all = rowsOf<{ id: string }>(CUSTOMER, customers).map((r) => ({
      ...r,
      id: `cus-${r.id}`,
    }))
    return fakeHttp((call) => {
      if (call.path.endsWith('/suppliers')) return supplierError()
      const page = Number(call.params?.page ?? 1)
      const size = Number(call.params?.pageSize ?? 25)
      return {
        totalItems: all.length,
        totalPages: Math.ceil(all.length / size),
        currentPage: page,
        items: all.slice((page - 1) * size, page * size),
      }
    })
  }

  it('serves the customers alone on a supplier 403, hasMore false on the last customer page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    customersOnly(3, forbidden)
    const { ids, more } = await walk(2)
    expect(ids).toEqual(['cus-row-1', 'cus-row-2', 'cus-row-3'])
    expect(more).toEqual([true, false])
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('suppliers:read')
  })

  it('on a supplier 403, a page ending exactly on the last customer reports no more rows', async () => {
    customersOnly(4, forbidden)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ids, more } = await walk(2)
    expect(ids).toEqual(['cus-row-1', 'cus-row-2', 'cus-row-3', 'cus-row-4'])
    expect(more).toEqual([true, false])
  })

  it('warns once per call on a supplier 403', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    customersOnly(1, forbidden)
    const params = withPageSink({ page: 1, limit: 10 })
    expect((await adapter().listContacts(CREDS, params)).map((r) => r.id)).toEqual(['cus-row-1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('still fails the list on a customers 403 (only the supplier read degrades)', async () => {
    const denied = forbidden()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fakeHttp(() => denied)
    await expect(adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toBe(
      denied,
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('still fails the list on a 403 from a supplier page after the first', async () => {
    const denied = forbidden()
    fakeHttp((call) => {
      if (!call.path.endsWith('/suppliers'))
        return { totalItems: 1, totalPages: 1, currentPage: 1, items: [copyOf(CUSTOMER)] }
      if (Number(call.params?.page) > 1) return denied
      return {
        totalItems: 4,
        totalPages: 2,
        currentPage: 1,
        items: [copyOf(SUPPLIER), copyOf(SUPPLIER)],
      }
    })
    await expect(adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toBe(
      denied,
    )
  })

  it('still fails the list on a supplier error other than 403', async () => {
    const boom = serverError()
    customersOnly(1, () => boom)
    await expect(adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toBe(
      boom,
    )
  })

  it('rejects an envelope without totalPages with a 502 (the end would be unknown)', async () => {
    fakeHttp(() => ({ items: [copyOf(CUSTOMER)] }))
    await expect(
      adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it('rejects a body that is not the documented envelope with a 502', async () => {
    fakeHttp(() => [copyOf(CUSTOMER)])
    await expect(
      adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })

  it("resolves a bill's contactId (supplierRef.id) to a listed supplier", async () => {
    const bill = await (async () => {
      fakeHttp(() => copyOf(SUPPLIER_INVOICE))
      return adapter().getBill(CREDS, SUPPLIER_INVOICE.id)
    })()
    vi.restoreAllMocks()
    fakeHttp((c) =>
      c.path.endsWith('/suppliers')
        ? {
            totalItems: 1,
            totalPages: 1,
            currentPage: 1,
            items: [{ ...copyOf<object>(SUPPLIER), id: SUPPLIER_INVOICE.supplierRef.id }],
          }
        : { totalItems: 0, totalPages: 0, currentPage: 1, items: [] },
    )
    const contacts = await adapter().listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(contacts.find((c) => c.id === bill.contactId)?.isSupplier).toBe(true)
  })
})

describe('bokio supplier writes (suppliers:write)', () => {
  const ID = '12345678-abcd-1234-abcd-1234567890ab'

  it('createContact POSTs a supplier for isSupplier without isCustomer', async () => {
    const { calls } = fakeHttp(() => copyOf(SUPPLIER_CREATED))
    const out = await adapter().createContact(CREDS, {
      name: 'Supplier ABC',
      isSupplier: true,
      identification: '556677-8899',
      taxNumber: 'SE123456789001',
    })
    expect(calls).toEqual([
      {
        method: 'POST',
        path: `companies/${COMPANY}/suppliers`,
        body: { name: 'Supplier ABC', orgNumber: '556677-8899', vatNumber: 'SE123456789001' },
      },
    ])
    expect(ContactSchema.parse(out)).toMatchObject({ id: ID, isSupplier: true })
  })

  it.each([
    ['a customer', { name: 'X', isCustomer: true }],
    ['both customer and supplier', { name: 'X', isCustomer: true, isSupplier: true }],
  ])('createContact refuses %s with 501 before any request', async (_w, data) => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(adapter().createContact(CREDS, data)).rejects.toMatchObject({ statusCode: 501 })
    expect(calls).toEqual([])
  })

  it('createContact refuses a supplier without a name with a 400 before any request', async () => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(adapter().createContact(CREDS, { isSupplier: true })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toEqual([])
  })

  it('updateContact on a supplier id reads it and PUTs it whole to suppliers/{id}', async () => {
    const { calls } = fakeHttp((c) => {
      if (c.path.includes('/customers/')) return notFound()
      return c.method === 'GET' ? copyOf(SUPPLIER) : copyOf(SUPPLIER_UPDATED)
    })
    const out = await adapter().updateContact(CREDS, ID, { name: 'Updated Supplier ABC' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET companies/${COMPANY}/customers/${ID}`,
      `GET companies/${COMPANY}/suppliers/${ID}`,
      `PUT companies/${COMPANY}/suppliers/${ID}`,
    ])
    const { id: _id, ...rest } = SUPPLIER
    expect(calls[2]!.body).toEqual({ ...rest, name: 'Updated Supplier ABC' })
    expect(ContactSchema.parse(out).name).toBe('Updated Supplier ABC')
  })

  it('updateContact refuses to turn a supplier into a customer', async () => {
    const { calls } = fakeHttp((c) =>
      c.path.includes('/customers/') ? notFound() : copyOf(SUPPLIER),
    )
    await expect(adapter().updateContact(CREDS, ID, { isCustomer: true })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('deleteContact DELETEs suppliers/{id} when GET customers/{id} is the documented 404', async () => {
    const { calls } = fakeHttp((c) =>
      c.path.includes('/customers/')
        ? notFound()
        : c.method === 'GET'
          ? copyOf(SUPPLIER)
          : undefined,
    )
    await adapter().deleteContact(CREDS, ID)
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET companies/${COMPANY}/customers/${ID}`,
      `GET companies/${COMPANY}/suppliers/${ID}`,
      `DELETE companies/${COMPANY}/suppliers/${ID}`,
    ])
  })

  it('deleteContact never DELETEs a customer that was not found', async () => {
    const { calls } = fakeHttp((c) => (c.method === 'GET' ? notFound() : undefined))
    await expect(adapter().deleteContact(CREDS, ID)).rejects.toMatchObject({
      response: { status: 404 },
    })
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })
})

describe('bokio createCreditMemo (POST invoices/{id}/credit, invoices:write)', () => {
  const INVOICE_ID = 'a419cf69-db6f-4de9-992c-b1a60942a443'

  it('credits the whole invoice named by appliedTo, with no body', async () => {
    const { calls } = fakeHttp(() => copyOf(CREDIT_NOTE_CREATED))
    const out = await adapter().createCreditMemo(CREDS, { appliedTo: [{ invoiceId: INVOICE_ID }] })
    expect(calls).toEqual([
      {
        method: 'POST',
        path: `companies/${COMPANY}/invoices/${INVOICE_ID}/credit`,
        body: undefined,
      },
    ])
    expect(CreditMemoSchema.parse(out)).toMatchObject({
      id: 'b529df79-eb7f-5ef0-a8dc-c2b71f953554',
      status: 'DRAFT',
      appliedTo: [{ invoiceId: INVOICE_ID }],
    })
  })

  it.each([
    ['no appliedTo', {}],
    ['two invoices', { appliedTo: [{ invoiceId: 'a' }, { invoiceId: 'b' }] }],
    ['an invoice number only', { appliedTo: [{ invoiceNumber: 'IN-1' }] }],
    ['a partial amount', { appliedTo: [{ invoiceId: 'a', amount: 100 }] }],
    ['line items', { appliedTo: [{ invoiceId: 'a' }], lineItems: [{ itemDescription: 'X' }] }],
    ['a total', { appliedTo: [{ invoiceId: 'a' }], totalAmount: 100 }],
    ['a published status', { appliedTo: [{ invoiceId: 'a' }], status: 'AUTHORIZED' as const }],
  ])('refuses %s with a 400 before any request', async (_w, data) => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(adapter().createCreditMemo(CREDS, data)).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toEqual([])
  })
})

describe('bokio bill writes (supplier-invoices:write)', () => {
  const SUPPLIER_ID = '6f6b2f17-3c4a-4a69-9f2d-3f5d7e1b8c90'

  it('listBills links attachments to the company upload download path', async () => {
    fakeHttp(() => copyOf(SUPPLIER_INVOICES_PAGE))
    const rows = await adapter().listBills(CREDS, withPageSink({ page: 1, limit: 25 }))
    const first = BillSchema.parse(rows[0])
    expect(first.attachments?.[0]?.url).toBe(
      `https://api.bokio.se/v1/companies/${COMPANY}/uploads/${first.attachments?.[0]?.id}/download`,
    )
  })

  it("createBill reads the supplier's currency and POSTs the documented body", async () => {
    const { calls } = fakeHttp((c) =>
      c.method === 'GET'
        ? { ...copyOf<object>(SUPPLIER), id: SUPPLIER_ID }
        : copyOf(SUPPLIER_INVOICE_CREATED),
    )
    const out = await adapter().createBill(CREDS, {
      contactId: SUPPLIER_ID,
      billNumber: 'INV-001',
      postedAt: '2023-10-01',
      dueAt: '2023-10-15',
      totalAmount: 100_000,
      attachments: [{ id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90' }],
    })
    expect(calls).toEqual([
      { method: 'GET', path: `companies/${COMPANY}/suppliers/${SUPPLIER_ID}`, params: undefined },
      {
        method: 'POST',
        path: `companies/${COMPANY}/supplier-invoices`,
        body: {
          supplierRef: { id: SUPPLIER_ID },
          invoiceNumber: 'INV-001',
          invoiceDate: '2023-10-01',
          dueDate: '2023-10-15',
          totalAmount: 1000,
          uploadRef: { id: '24f3b7c1-8d6a-4e2f-9b31-5d7c2a8e4f90' },
        },
      },
    ])
    expect(BillSchema.parse(out)).toMatchObject({ id: SUPPLIER_ID, totalAmount: 100_000 })
  })

  it("createBill scales by a JPY supplier's currency", async () => {
    const { calls } = fakeHttp((c) =>
      c.method === 'GET'
        ? { ...copyOf<object>(SUPPLIER), currency: 'JPY' }
        : copyOf(SUPPLIER_INVOICE_CREATED),
    )
    await adapter().createBill(CREDS, {
      contactId: SUPPLIER_ID,
      postedAt: '2023-10-01',
      dueAt: '2023-10-15',
      totalAmount: 1000,
    })
    expect((calls[1]!.body as { totalAmount: number }).totalAmount).toBe(1000)
  })

  it("createBill refuses a currency other than the supplier's before posting", async () => {
    const { calls } = fakeHttp(() => copyOf(SUPPLIER))
    await expect(
      adapter().createBill(CREDS, {
        contactId: SUPPLIER_ID,
        currency: 'EUR',
        postedAt: '2023-10-01',
        dueAt: '2023-10-15',
        totalAmount: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(calls.map((c) => c.method)).toEqual(['GET'])
  })

  it('createBill refuses a bill without contactId before any request', async () => {
    const { calls } = fakeHttp(() => new Error('no request expected'))
    await expect(adapter().createBill(CREDS, { totalAmount: 1 })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(calls).toEqual([])
  })

  it('updateBill reads the supplier invoice and PUTs it whole, lines kept', async () => {
    const { calls } = fakeHttp((c) =>
      c.method === 'GET' ? copyOf(SUPPLIER_INVOICE) : copyOf(SUPPLIER_INVOICE_UPDATED),
    )
    const out = await adapter().updateBill(CREDS, SUPPLIER_ID, { dueAt: '2023-10-31' })
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `GET companies/${COMPANY}/supplier-invoices/${SUPPLIER_ID}`,
      `PUT companies/${COMPANY}/supplier-invoices/${SUPPLIER_ID}`,
    ])
    expect(calls[1]!.body).toEqual({
      supplierRef: { id: SUPPLIER_ID },
      invoiceNumber: 'INV-001',
      invoiceDate: '2023-10-01',
      dueDate: '2023-10-31',
      totalAmount: 1000,
      lineItems: SUPPLIER_INVOICE.lineItems,
    })
    expect(BillSchema.parse(out).id).toBe(SUPPLIER_ID)
  })

  it('updateBill refuses a move to a supplier in another currency before the PUT', async () => {
    const OTHER = '12345678-abcd-1234-abcd-1234567890ab'
    const { calls } = fakeHttp((c) =>
      c.path.includes('/suppliers/')
        ? { ...copyOf<object>(SUPPLIER), id: OTHER, currency: 'EUR' }
        : copyOf(SUPPLIER_INVOICE),
    )
    await expect(
      adapter().updateBill(CREDS, SUPPLIER_ID, { contactId: OTHER }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET'])
  })

  it('updateBill moves the bill to another supplier in the same currency', async () => {
    const OTHER = '12345678-abcd-1234-abcd-1234567890ab'
    const { calls } = fakeHttp((c) =>
      c.method === 'PUT'
        ? copyOf(SUPPLIER_INVOICE_UPDATED)
        : c.path.includes('/suppliers/')
          ? { ...copyOf<object>(SUPPLIER), id: OTHER }
          : copyOf(SUPPLIER_INVOICE),
    )
    await adapter().updateBill(CREDS, SUPPLIER_ID, { contactId: OTHER })
    expect(calls.map((c) => c.method)).toEqual(['GET', 'GET', 'PUT'])
    expect((calls[2]!.body as { supplierRef: { id: string } }).supplierRef).toEqual({ id: OTHER })
  })

  it('deleteBill DELETEs supplier-invoices/{id}', async () => {
    const { calls } = fakeHttp(() => undefined)
    await adapter().deleteBill(CREDS, SUPPLIER_ID)
    expect(calls).toEqual([
      { method: 'DELETE', path: `companies/${COMPANY}/supplier-invoices/${SUPPLIER_ID}` },
    ])
  })
})
