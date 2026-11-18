/**
 * The Saasu adapter over a mocked HTTP layer: every method on its documented
 * endpoint (https://api.saasu.com/Help, fetched 2026-09-29), with `FileId`
 * and `wsAccessKey` as URL arguments, `Page`/`PageSize` paging, the
 * documented response keys, and the refusals.
 *
 * Before the rebuild the adapter called GET Entity, JournalEntries,
 * Transactions, SaleOrders and PurchaseOrders (none documented), sent
 * `FileUid`, `pageSize`/`pageNumber`, `isPurchase` and a `wsaccesskey`
 * header, and read `InvoiceTransactionList`, `ContactList`, `AccountList`,
 * `TaxCodeList` and `JournalEntryList`, so every list came back empty.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { SaasuAdapter } from '../../../../../../src/verticals/accounting/adapters/saasu'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'
import { ExpenseSchema } from '../../../../../../src/verticals/accounting/schema/expense'
import { OrderSchema } from '../../../../../../src/verticals/accounting/schema/order'
import { SalesOrderSchema } from '../../../../../../src/verticals/accounting/schema/salesorder'
import { PurchaseOrderSchema } from '../../../../../../src/verticals/accounting/schema/purchaseorder'
import { ContactSchema } from '../../../../../../src/verticals/accounting/schema/contact'
import { AccountSchema } from '../../../../../../src/verticals/accounting/schema/account'
import { JournalSchema } from '../../../../../../src/verticals/accounting/schema/journal'
import { TaxRateSchema } from '../../../../../../src/verticals/accounting/schema/taxrate'
import { OrganizationSchema } from '../../../../../../src/verticals/accounting/schema/organization'
import {
  account,
  contact,
  fileIdentity,
  invoiceDetail,
  invoiceSummary,
  journalDetail,
  journalSummary,
  taxCode,
} from './fixtures'

const CREDS = { accessToken: 'wsak_1', extra: { fileUid: '12345' } }
const AUTH = { FileId: '12345', wsAccessKey: 'wsak_1' }

interface Call {
  path: string
  params?: Record<string, unknown>
}

function fakeHttp(respond: (call: Call) => unknown): { calls: Call[] } {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockReturnValue({
    get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const call = { path, params: cfg?.params }
      calls.push(call)
      const data = respond(call)
      if (data instanceof Error) throw data
      return { data }
    },
  } as never)
  return { calls }
}

const NEXT = { rel: 'next', href: 'https://api.saasu.com/X?FileId=123&Page=2&PageSize=25' }
const SELF = { rel: 'self', href: 'https://api.saasu.com/X?FileId=123' }

const adapter = () => new SaasuAdapter({ wsaccessKey: '', fileUid: '' })
const page = (p: Partial<QueryParams> = {}) => withPageSink({ page: 1, limit: 25, ...p })

afterEach(() => vi.restoreAllMocks())

// One row of every InvoiceType on both sides, ids 1..n in this order.
const MIXED = [
  invoiceSummary({ TransactionId: 1, TransactionType: 'S', InvoiceType: 'Tax Invoice' }),
  invoiceSummary({ TransactionId: 2, TransactionType: 'S', InvoiceType: 'Adjustment Note' }),
  invoiceSummary({ TransactionId: 3, TransactionType: 'S', InvoiceType: 'Sale Order' }),
  invoiceSummary({ TransactionId: 4, TransactionType: 'S', InvoiceType: 'Quote' }),
  invoiceSummary({ TransactionId: 5, TransactionType: 'S', InvoiceType: 'Money In (Income)' }),
  invoiceSummary({ TransactionId: 6, TransactionType: 'P', InvoiceType: 'Tax Invoice' }),
  invoiceSummary({ TransactionId: 7, TransactionType: 'P', InvoiceType: 'RCT Invoice' }),
  invoiceSummary({ TransactionId: 8, TransactionType: 'P', InvoiceType: 'Purchase Order' }),
  invoiceSummary({ TransactionId: 9, TransactionType: 'P', InvoiceType: 'Money Out (Expense)' }),
  invoiceSummary({ TransactionId: 10, TransactionType: 'P', InvoiceType: 'Adjustment Note' }),
]

describe('capabilities', () => {
  it('declares the documented PageSize maximum of 100', () => {
    expect(adapter().capabilities).toEqual({ maxPageSize: 100 })
  })
})

describe('invoice-backed lists', () => {
  const cases = [
    {
      name: 'listInvoices',
      side: 'S',
      ids: ['1'],
      run: (p: QueryParams) => adapter().listInvoices(CREDS, p),
      schema: InvoiceSchema,
    },
    {
      name: 'listBills',
      side: 'P',
      ids: ['6', '7'],
      run: (p: QueryParams) => adapter().listBills(CREDS, p),
      schema: BillSchema,
    },
    {
      name: 'listExpenses',
      side: 'P',
      ids: ['9'],
      run: (p: QueryParams) => adapter().listExpenses(CREDS, p),
      schema: ExpenseSchema,
    },
    {
      name: 'listSalesOrders',
      side: 'S',
      ids: ['3'],
      run: (p: QueryParams) => adapter().listSalesOrders(CREDS, p),
      schema: SalesOrderSchema,
    },
    {
      name: 'listPurchaseOrders',
      side: 'P',
      ids: ['8'],
      run: (p: QueryParams) => adapter().listPurchaseOrders(CREDS, p),
      schema: PurchaseOrderSchema,
    },
    {
      name: 'listOrders',
      side: undefined,
      ids: ['3', '8'],
      run: (p: QueryParams) => adapter().listOrders(CREDS, p),
      schema: OrderSchema,
    },
  ] as const

  for (const c of cases) {
    describe(c.name, () => {
      it('pages GET Invoices with the documented arguments, one request, no detail fetches', async () => {
        const { calls } = fakeHttp(() => ({ Invoices: MIXED, _links: [SELF] }))
        await c.run(page({ page: 3, limit: 40 }))
        expect(calls).toEqual([
          {
            path: 'Invoices',
            params: {
              ...AUTH,
              Page: 3,
              PageSize: 40,
              ...(c.side ? { TransactionType: c.side } : {}),
            },
          },
        ])
      })

      it('keeps only its own InvoiceType rows, each schema-valid', async () => {
        fakeHttp((call) =>
          call.params?.['TransactionType']
            ? {
                Invoices: MIXED.filter(
                  (r) => r.TransactionType === call.params!['TransactionType'],
                ),
              }
            : { Invoices: MIXED },
        )
        const rows = await c.run(page())
        expect(rows.map((r) => c.schema.parse(r).id)).toEqual(c.ids)
        expect(rows[0]).toMatchObject({ totalAmount: 1045, contactId: '1568986' })
      })

      it('reports hasMore from the next link even when the filtered page is empty', async () => {
        fakeHttp(() => ({ Invoices: [MIXED[3]], _links: [SELF, NEXT] }))
        const params = page({ limit: 1 })
        expect(await c.run(params)).toEqual([])
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 1 })
      })

      it('reports the end on a short page even with a next link, as the documented samples show', async () => {
        // GET Invoices sample: 2 rows, PageSize 25, and still a rel "next" link.
        fakeHttp(() => ({ Invoices: MIXED.slice(0, 2), _links: [SELF, NEXT] }))
        const params = page({ limit: 25 })
        await c.run(params)
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pageSize: 25 })
      })

      it('reports the end on an empty page even with a next link', async () => {
        fakeHttp(() => ({ Invoices: [], _links: [SELF, NEXT] }))
        const params = page({ limit: 25 })
        expect(await c.run(params)).toEqual([])
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
      })

      it('reports the end when there is no next link', async () => {
        fakeHttp(() => ({ Invoices: MIXED, _links: [SELF] }))
        const params = page({ limit: 10 })
        await c.run(params)
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
      })

      it('refuses the undocumented InvoiceTransactionList body instead of reading it as empty', async () => {
        fakeHttp(() => ({ InvoiceTransactionList: MIXED }))
        await expect(c.run(page())).rejects.toMatchObject({ statusCode: 502 })
      })

      it('sends both documented LastModified dates for updatedAfter', async () => {
        vi.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z'), toFake: ['Date'] })
        try {
          const { calls } = fakeHttp(() => ({ Invoices: [], _links: [] }))
          await c.run(page({ updatedAfter: new Date('2026-09-01T08:30:00Z') }))
          expect(calls[0]!.params).toMatchObject({
            LastModifiedFromDate: '2026-09-01',
            LastModifiedToDate: '2026-09-30',
          })
        } finally {
          vi.useRealTimers()
        }
      })
    })
  }

  it('clamps PageSize to 100 and reports that size', async () => {
    const { calls } = fakeHttp(() => ({ Invoices: [], _links: [] }))
    const params = page({ limit: 500 })
    await adapter().listInvoices(CREDS, params)
    expect(calls[0]!.params).toMatchObject({ PageSize: 100 })
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100 })
  })

  it('judges the unfiltered page length when _links is absent', async () => {
    fakeHttp(() => ({ Invoices: MIXED.slice(0, 2) }))
    const full = page({ limit: 2 })
    await adapter().listInvoices(CREDS, full)
    expect(readUpstreamPage(full)).toMatchObject({ hasMore: true })
    const short = page({ limit: 3 })
    await adapter().listInvoices(CREDS, short)
    expect(readUpstreamPage(short)).toMatchObject({ hasMore: false })
  })
})

describe('invoice-backed gets', () => {
  const cases = [
    {
      name: 'getInvoice',
      ok: { TransactionType: 'S', InvoiceType: 'Tax Invoice' },
      wrong: { TransactionType: 'P', InvoiceType: 'Tax Invoice' },
      run: (id: string) => adapter().getInvoice(CREDS, id),
      schema: InvoiceSchema,
    },
    {
      name: 'getBill',
      ok: { TransactionType: 'P', InvoiceType: 'RCT Invoice' },
      wrong: { TransactionType: 'P', InvoiceType: 'Purchase Order' },
      run: (id: string) => adapter().getBill(CREDS, id),
      schema: BillSchema,
    },
    {
      name: 'getExpense',
      ok: { TransactionType: 'P', InvoiceType: 'Money Out (Expense)' },
      wrong: { TransactionType: 'P', InvoiceType: 'Tax Invoice' },
      run: (id: string) => adapter().getExpense(CREDS, id),
      schema: ExpenseSchema,
    },
    {
      name: 'getOrder',
      ok: { TransactionType: 'P', InvoiceType: 'Purchase Order' },
      wrong: { TransactionType: 'S', InvoiceType: 'Quote' },
      run: (id: string) => adapter().getOrder(CREDS, id),
      schema: OrderSchema,
    },
    {
      name: 'getSalesOrder',
      ok: { TransactionType: 'S', InvoiceType: 'Sale Order' },
      wrong: { TransactionType: 'P', InvoiceType: 'Purchase Order' },
      run: (id: string) => adapter().getSalesOrder(CREDS, id),
      schema: SalesOrderSchema,
    },
    {
      name: 'getPurchaseOrder',
      ok: { TransactionType: 'P', InvoiceType: 'Purchase Order' },
      wrong: { TransactionType: 'S', InvoiceType: 'Sale Order' },
      run: (id: string) => adapter().getPurchaseOrder(CREDS, id),
      schema: PurchaseOrderSchema,
    },
  ] as const

  for (const c of cases) {
    describe(c.name, () => {
      it('reads GET Invoice/{id}, the detail at the top level, with line items', async () => {
        const { calls } = fakeHttp(() => invoiceDetail(c.ok))
        const row = c.schema.parse(await c.run('5093684'))
        expect(calls).toEqual([{ path: 'Invoice/5093684', params: AUTH }])
        expect(row).toMatchObject({ id: '5093684', totalAmount: 1045 })
        expect(row.lineItems).toHaveLength(1)
      })

      it('answers 404 for a different kind of document', async () => {
        fakeHttp(() => invoiceDetail(c.wrong))
        await expect(c.run('5093684')).rejects.toMatchObject({ statusCode: 404 })
      })

      it('answers 404 for a non-integer id without a request', async () => {
        const { calls } = fakeHttp(() => invoiceDetail(c.ok))
        await expect(c.run('INV-1')).rejects.toMatchObject({ statusCode: 404 })
        expect(calls).toEqual([])
      })

      it('refuses the undocumented { InvoiceTransaction } wrapper', async () => {
        fakeHttp(() => ({ InvoiceTransaction: invoiceDetail(c.ok) }))
        await expect(c.run('5093684')).rejects.toMatchObject({ statusCode: 502 })
      })
    })
  }
})

describe('other lists', () => {
  const cases = [
    {
      name: 'listContacts',
      path: 'Contacts',
      key: 'Contacts',
      oldKey: 'ContactList',
      row: contact(),
      id: '896421',
      modified: true,
      run: (p: QueryParams) => adapter().listContacts(CREDS, p),
      schema: ContactSchema,
    },
    {
      name: 'listAccounts',
      path: 'Accounts',
      key: 'Accounts',
      oldKey: 'AccountList',
      row: account(),
      id: '1',
      modified: false,
      run: (p: QueryParams) => adapter().listAccounts(CREDS, p),
      schema: AccountSchema,
    },
    {
      name: 'listJournals',
      path: 'Journals',
      key: 'Journals',
      oldKey: 'JournalEntryList',
      row: journalSummary(),
      id: '5093684',
      modified: true,
      run: (p: QueryParams) => adapter().listJournals(CREDS, p),
      schema: JournalSchema,
    },
    {
      name: 'listTaxRates',
      path: 'TaxCodes',
      key: 'TaxCodes',
      oldKey: 'TaxCodeList',
      row: taxCode(),
      id: '1',
      modified: false,
      run: (p: QueryParams) => adapter().listTaxRates(CREDS, p),
      schema: TaxRateSchema,
    },
  ] as const

  for (const c of cases) {
    describe(c.name, () => {
      it(`pages GET ${c.path} and reads { ${c.key}[] }`, async () => {
        const { calls } = fakeHttp(() => ({ [c.key]: [c.row], _links: [SELF, NEXT] }))
        const params = page({ page: 2, limit: 30 })
        const rows = await c.run(params)
        expect(calls).toEqual([{ path: c.path, params: { ...AUTH, Page: 2, PageSize: 30 } }])
        expect(rows.map((r) => c.schema.parse(r).id)).toEqual([c.id])
        // A short page is the last even with the next link the samples carry.
        expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, pageSize: 30 })
      })

      it('reports more on a full page with a next link, and the end without one', async () => {
        fakeHttp(() => ({ [c.key]: [c.row], _links: [SELF, NEXT] }))
        const more = page({ limit: 1 })
        await c.run(more)
        expect(readUpstreamPage(more)).toMatchObject({ hasMore: true, pageSize: 1 })
        vi.restoreAllMocks()
        fakeHttp(() => ({ [c.key]: [c.row], _links: [SELF] }))
        const end = page({ limit: 1 })
        await c.run(end)
        expect(readUpstreamPage(end)).toMatchObject({ hasMore: false })
      })

      it(`refuses the undocumented ${c.oldKey} body`, async () => {
        fakeHttp(() => ({ [c.oldKey]: [c.row] }))
        await expect(c.run(page())).rejects.toMatchObject({ statusCode: 502 })
      })

      it(
        c.modified
          ? 'sends LastModifiedFromDate and LastModifiedToDate for updatedAfter'
          : 'serves the whole list for updatedAfter (no documented filter)',
        async () => {
          vi.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z'), toFake: ['Date'] })
          try {
            const { calls } = fakeHttp(() => ({ [c.key]: [], _links: [] }))
            await c.run(page({ updatedAfter: new Date('2026-09-01T08:30:00Z') }))
            const expected = c.modified
              ? { LastModifiedFromDate: '2026-09-01', LastModifiedToDate: '2026-09-30' }
              : {}
            expect(calls[0]!.params).toEqual({ ...AUTH, Page: 1, PageSize: 25, ...expected })
          } finally {
            vi.useRealTimers()
          }
        },
      )
    })
  }
})

describe('other gets', () => {
  it('getContact reads GET Contact/{id}', async () => {
    const { calls } = fakeHttp(() => contact())
    const c = ContactSchema.parse(await adapter().getContact(CREDS, '896421'))
    expect(calls).toEqual([{ path: 'Contact/896421', params: AUTH }])
    expect(c.id).toBe('896421')
  })

  it('getAccount reads GET Account/{Id}', async () => {
    const { calls } = fakeHttp(() => account())
    const a = AccountSchema.parse(await adapter().getAccount(CREDS, '1'))
    expect(calls).toEqual([{ path: 'Account/1', params: AUTH }])
    expect(a.type).toBe('INCOME')
  })

  it('getJournal reads GET Journal/{id} with its Items', async () => {
    const { calls } = fakeHttp(() => journalDetail())
    const j = JournalSchema.parse(await adapter().getJournal(CREDS, '5093684'))
    expect(calls).toEqual([{ path: 'Journal/5093684', params: AUTH }])
    expect(j.lineItems).toEqual([{ accountId: '321', creditAmount: 1000, debitAmount: undefined }])
  })

  it('getTaxRate reads GET TaxCode/{id}', async () => {
    const { calls } = fakeHttp(() => taxCode())
    const t = TaxRateSchema.parse(await adapter().getTaxRate(CREDS, '1'))
    expect(calls).toEqual([{ path: 'TaxCode/1', params: AUTH }])
    expect(t.rate).toBe(10)
  })

  it('answers 404 for a tax code named by its code rather than its Id, without a request', async () => {
    const { calls } = fakeHttp(() => taxCode())
    await expect(adapter().getTaxRate(CREDS, 'G1')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toEqual([])
  })

  it('refuses the undocumented { Contact } wrapper', async () => {
    fakeHttp(() => ({ Contact: contact() }))
    await expect(adapter().getContact(CREDS, '896421')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('getOrganization reads GET FileIdentity, the FileId as id', async () => {
    const { calls } = fakeHttp(() => fileIdentity())
    const org = OrganizationSchema.parse(await adapter().getOrganization(CREDS))
    expect(calls).toEqual([{ path: 'FileIdentity', params: AUTH }])
    expect(org).toMatchObject({ id: '12345', name: 'Test File', taxNumber: '53004085616' })
  })
})

describe('refusals', () => {
  it('listTransactions refuses 501 NOT_SUPPORTED before any request', async () => {
    const { calls } = fakeHttp(() => ({}))
    await expect(adapter().listTransactions(CREDS, page())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('getTransaction refuses 501 NOT_SUPPORTED before any request', async () => {
    const { calls } = fakeHttp(() => ({}))
    await expect(adapter().getTransaction(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('is read-only: it declares no write method', () => {
    const a = adapter() as unknown as Record<string, unknown>
    for (const m of [
      'createInvoice',
      'updateInvoice',
      'createBill',
      'createContact',
      'updateContact',
      'createJournal',
      'createExpense',
      'createCreditMemo',
      'createOrder',
      'createSalesOrder',
      'createPurchaseOrder',
    ]) {
      expect(a[m], m).toBeUndefined()
    }
  })
})

describe('no undocumented endpoint is called', () => {
  it('never requests Entity, JournalEntries, Transactions, SaleOrders or PurchaseOrders', async () => {
    const { calls } = fakeHttp((call) => {
      if (call.path === 'FileIdentity') return fileIdentity()
      if (call.path === 'Journals') return { Journals: [] }
      if (call.path.startsWith('Journal/')) return journalDetail()
      if (call.path.startsWith('Invoice/')) return invoiceDetail({ InvoiceType: 'Sale Order' })
      return { Invoices: [] }
    })
    const a = adapter()
    await a.getOrganization(CREDS)
    await a.listJournals(CREDS, page())
    await a.getJournal(CREDS, '1')
    await a.listOrders(CREDS, page())
    await a.listSalesOrders(CREDS, page())
    await a.listPurchaseOrders(CREDS, page())
    await a.getSalesOrder(CREDS, '1')
    await a.listTransactions(CREDS, page()).catch(() => undefined)
    const paths = calls.map((c) => c.path.split('/')[0])
    for (const bad of [
      'Entity',
      'JournalEntries',
      'JournalEntry',
      'Transactions',
      'SaleOrders',
      'SaleOrder',
      'PurchaseOrders',
      'PurchaseOrder',
    ]) {
      expect(paths).not.toContain(bad)
    }
    for (const c of calls) {
      expect(c.params).toMatchObject(AUTH)
      expect(Object.keys(c.params ?? {})).not.toContain('FileUid')
      expect(Object.keys(c.params ?? {})).not.toContain('pageSize')
      expect(Object.keys(c.params ?? {})).not.toContain('isPurchase')
    }
  })
})
