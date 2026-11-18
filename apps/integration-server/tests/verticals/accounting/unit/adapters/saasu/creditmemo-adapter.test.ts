/**
 * Saasu credit memos over a mocked HTTP layer.
 *
 * Saasu documents no credit-note endpoint; the adapter used to call
 * `GET CreditRefunds` and `GET CreditRefund/{id}`, which appear nowhere in
 * https://api.saasu.com/Help. A credit note is a sale of InvoiceType
 * "Adjustment Note", read from GET Invoices (`Page`, `PageSize` ≤ 100,
 * `TransactionType`, `LastModifiedFromDate` + `LastModifiedToDate`; response
 * `{ Invoices[], _links[] }`) and GET Invoice/{id} (the detail at the top
 * level), with `FileId` and `wsAccessKey` as URL arguments.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { SaasuAdapter } from '../../../../../../src/verticals/accounting/adapters/saasu'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'

const CREDS = { accessToken: 'wsak_1', extra: { fileUid: '12345' } }

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

function row(id: number, type = 'Adjustment Note') {
  return {
    TransactionId: id,
    Currency: 'AUD',
    InvoiceNumber: `INV-${id}`,
    InvoiceType: type,
    TransactionType: 'S',
    TotalAmount: -10.45,
    TotalTaxAmount: -0.95,
    IsTaxInc: true,
    AmountPaid: 0,
    AmountOwed: -10.45,
    TransactionDate: '2015-01-24T00:00:00',
    BillingContactId: 1568986,
    PaymentStatus: 'U',
    _links: [],
  }
}

const NEXT = {
  rel: 'next',
  href: 'https://api.saasu.com/Invoices?FileId=123&Page=2&PageSize=25',
  method: 'GET',
}
const SELF = { rel: 'self', href: 'https://api.saasu.com/Invoices?FileId=123', method: 'GET' }

const adapter = () => new SaasuAdapter({ wsaccessKey: '', fileUid: '' })

afterEach(() => vi.restoreAllMocks())

describe('SaasuAdapter.listCreditMemos', () => {
  it('pages sales from GET Invoices with the documented parameters', async () => {
    const { calls } = fakeHttp(() => ({ Invoices: [row(1)], _links: [SELF] }))
    const params = withPageSink({ page: 2, limit: 10 })
    await adapter().listCreditMemos(CREDS, params)
    expect(calls).toEqual([
      {
        path: 'Invoices',
        params: {
          FileId: '12345',
          wsAccessKey: 'wsak_1',
          Page: 2,
          PageSize: 10,
          TransactionType: 'S',
        },
      },
    ])
  })

  it('never calls the undocumented CreditRefunds endpoint', async () => {
    const { calls } = fakeHttp(() => ({ Invoices: [], _links: [] }))
    await adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 25 }))
    expect(calls.map((c) => c.path)).not.toContain('CreditRefunds')
  })

  it('keeps only adjustment notes, each schema-valid', async () => {
    fakeHttp(() => ({
      Invoices: [row(1), row(2, 'Tax Invoice'), row(3), row(4, 'Quote')],
      _links: [SELF],
    }))
    const rows = await adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 25 }))
    expect(rows.map((r) => CreditMemoSchema.parse(r).id)).toEqual(['1', '3'])
    expect(rows[0]).toMatchObject({ totalAmount: 1045, contactId: '1568986', status: 'AUTHORIZED' })
  })

  it('reports hasMore from the next link, so a filtered-empty page does not end the walk', async () => {
    fakeHttp(() => ({
      Invoices: [row(1, 'Tax Invoice'), row(2, 'Tax Invoice')],
      _links: [SELF, NEXT],
    }))
    const params = withPageSink({ page: 1, limit: 2 })
    expect(await adapter().listCreditMemos(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 2 })
  })

  it('reports no more pages when there is no next link', async () => {
    fakeHttp(() => ({ Invoices: [row(1), row(2)], _links: [SELF] }))
    const params = withPageSink({ page: 3, limit: 2 })
    await adapter().listCreditMemos(CREDS, params)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })

  it('judges by the unfiltered page length when _links is absent', async () => {
    fakeHttp(() => ({ Invoices: [row(1, 'Tax Invoice'), row(2, 'Tax Invoice')] }))
    const full = withPageSink({ page: 1, limit: 2 })
    await adapter().listCreditMemos(CREDS, full)
    expect(readUpstreamPage(full)).toMatchObject({ hasMore: true })

    const short = withPageSink({ page: 1, limit: 3 })
    await adapter().listCreditMemos(CREDS, short)
    expect(readUpstreamPage(short)).toMatchObject({ hasMore: false })
  })

  it('clamps PageSize to the documented maximum of 100', async () => {
    const { calls } = fakeHttp(() => ({ Invoices: [], _links: [] }))
    const params = withPageSink({ page: 1, limit: 500 })
    await adapter().listCreditMemos(CREDS, params)
    expect(calls[0]!.params).toMatchObject({ PageSize: 100 })
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100 })
  })

  it('sends both documented LastModified dates for updatedAfter', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z'), toFake: ['Date'] })
    try {
      const { calls } = fakeHttp(() => ({ Invoices: [], _links: [] }))
      await adapter().listCreditMemos(
        CREDS,
        withPageSink({ page: 1, limit: 25, updatedAfter: new Date('2026-09-01T08:30:00Z') }),
      )
      expect(calls[0]!.params).toMatchObject({
        LastModifiedFromDate: '2026-09-01',
        LastModifiedToDate: '2026-09-30',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('refuses a body without the documented Invoices array', async () => {
    fakeHttp(() => ({ InvoiceTransactionList: [row(1)] }))
    await expect(
      adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 25 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('SaasuAdapter.getCreditMemo', () => {
  it('reads GET Invoice/{id}, detail at the top level', async () => {
    const { calls } = fakeHttp(() => ({
      ...row(7),
      LineItems: [
        { Id: 30, Description: 'Sale Item', TotalAmount: -10.45, Quantity: -1, UnitPrice: 10.45 },
      ],
    }))
    const cm = CreditMemoSchema.parse(await adapter().getCreditMemo(CREDS, '7'))
    expect(calls).toEqual([
      { path: 'Invoice/7', params: { FileId: '12345', wsAccessKey: 'wsak_1' } },
    ])
    expect(cm).toMatchObject({ id: '7', totalAmount: 1045 })
    expect(cm.lineItems).toHaveLength(1)
  })

  it('answers 404 for a transaction that is not a sale adjustment note', async () => {
    fakeHttp(() => row(7, 'Tax Invoice'))
    await expect(adapter().getCreditMemo(CREDS, '7')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 404 for a purchase adjustment note (a supplier credit)', async () => {
    fakeHttp(() => ({ ...row(7), TransactionType: 'P' }))
    await expect(adapter().getCreditMemo(CREDS, '7')).rejects.toMatchObject({ statusCode: 404 })
  })
})
