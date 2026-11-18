/**
 * QuickFile credit memos over a mocked HTTP layer.
 *
 * The adapter used to POST invoice/search with `InvoiceType: 'CREDITMEMO'`,
 * a value QuickFile does not document (Invoice_Search's InvoiceType is
 * INVOICE | ESTIMATE | RECURRING, https://api.quickfile.co.uk/d/v1_2/Invoice_Search),
 * and read `payload.Body`, which is the REQUEST envelope. Credit notes are
 * negative-value invoices, and responses are keyed by the method name
 * (`{ Invoice_Search: { Header, Body } }`), per the vendor's JSON samples.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { createHash } from 'node:crypto'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { QuickfileAdapter } from '../../../../../../src/verticals/accounting/adapters/quickfile'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'

const CREDS = { accessToken: 'API-KEY', extra: { accNumber: '6131400000', applicationId: 'app-1' } }

interface Call {
  path: string
  body: {
    payload: {
      Header: Record<string, unknown> & { Authentication?: Record<string, unknown> }
      Body: Record<string, unknown>
    }
  }
}

function fakeHttp(respond: (call: Call) => unknown): { calls: Call[] } {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockReturnValue({
    post: async (path: string, body: Call['body']) => {
      const call = { path, body }
      calls.push(call)
      const data = respond(call)
      if (data instanceof Error) throw data
      return { data }
    },
  } as never)
  return { calls }
}

function row(id: number, amount: number) {
  return {
    IssueDate: '2017-05-24',
    InvoiceID: id,
    ClientID: 326723,
    ClientCompanyName: 'Acme Printing',
    ClientContactName: 'John Smith',
    InvoiceNumber: `0000${id}`,
    Description: 'TEST',
    Currency: 'GBP',
    Amount: amount,
    VatAmount: amount / 6,
    Status: 'SENT',
    ViewHref: 'https://www.quickfile.co.uk/Sales/ViewPlaceholder?q=######',
  }
}

function searchResponse(records: unknown[] | undefined, recordsetCount: number | string) {
  return {
    Invoice_Search: {
      Header: { MessageType: 'Response', SubmissionNumber: 'x' },
      Body: {
        RecordsetCount: recordsetCount,
        ReturnCount: records?.length ?? 0,
        ...(records && { Record: records }),
      },
    },
  }
}

const adapter = () => new QuickfileAdapter()

afterEach(() => vi.restoreAllMocks())

describe('QuickfileAdapter.listCreditMemos', () => {
  it('searches INVOICEs with the documented mandatory parameters and a row offset', async () => {
    const { calls } = fakeHttp(() => searchResponse([], 0))
    await adapter().listCreditMemos(CREDS, withPageSink({ page: 3, limit: 25 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('invoice/search')
    expect(calls[0]!.body.payload.Body).toEqual({
      SearchParameters: {
        ReturnCount: 25,
        Offset: 50,
        OrderResultsBy: 'InvoiceNumber',
        OrderDirection: 'ASC',
        InvoiceType: 'INVOICE',
        AmountTo: 0,
        AdditionalParameters: { ShowVatAmount: true },
      },
    })
  })

  it('sends the documented Header, with the credentials inside Authentication', async () => {
    const { calls } = fakeHttp(() => searchResponse([], 0))
    await adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 }))
    const header = calls[0]!.body.payload.Header
    const submission = String(header.SubmissionNumber)
    expect(header).toEqual({
      MessageType: 'Request',
      SubmissionNumber: submission,
      Authentication: {
        AccNumber: '6131400000',
        MD5Value: createHash('md5').update(`6131400000API-KEY${submission}`).digest('hex'),
        ApplicationID: 'app-1',
      },
    })
  })

  it('keeps only the negative-value invoices and maps them through the schema', async () => {
    fakeHttp(() => searchResponse([row(1, -12), row(2, 48), row(3, -6)], 3))
    const out = await adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(out.map((c) => c.id)).toEqual(['1', '3'])
    const first = CreditMemoSchema.parse(out[0])
    expect(first.totalAmount).toBe(1200)
    expect(first.taxAmount).toBe(200)
    expect(first.contactId).toBe('cust_326723')
  })

  it('reports hasMore from the invoice page, not from the filtered rows', async () => {
    // A page of 10 positive invoices holds no credit notes but is not the end.
    fakeHttp(() =>
      searchResponse(
        Array.from({ length: 10 }, (_, i) => row(i + 1, 5)),
        35,
      ),
    )
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await adapter().listCreditMemos(CREDS, params)
    expect(out).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('ends the collection when the offset reaches RecordsetCount', async () => {
    fakeHttp(() => searchResponse([row(31, -1), row(32, 2)], '32'))
    const params = withPageSink({ page: 4, limit: 10 })
    await adapter().listCreditMemos(CREDS, params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('never reports RecordsetCount as the credit-note total', async () => {
    fakeHttp(() => searchResponse([row(1, -1)], 500))
    const params = withPageSink({ page: 1, limit: 10 })
    await adapter().listCreditMemos(CREDS, params)
    expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
  })

  it('reads a one-row page, which QuickFile sends as a bare Record object (t/16824)', async () => {
    fakeHttp(() => ({
      Invoice_Search: {
        Header: { MessageType: 'Response', SubmissionNumber: 'x' },
        Body: { RecordsetCount: '1', ReturnCount: '1', Record: row(9, -30) },
      },
    }))
    const params = withPageSink({ page: 1, limit: 10 })
    const out = await adapter().listCreditMemos(CREDS, params)
    expect(out.map((c) => CreditMemoSchema.parse(c).id)).toEqual(['9'])
    expect(out[0]!.totalAmount).toBe(3000)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('treats an absent Record as an empty page', async () => {
    fakeHttp(() => searchResponse(undefined, 0))
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await adapter().listCreditMemos(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false })
  })

  it('clamps ReturnCount to 200 and reports the size it asked for', async () => {
    const { calls } = fakeHttp(() => searchResponse([], 1000))
    const params = withPageSink({ page: 2, limit: 500 })
    await adapter().listCreditMemos(CREDS, params)
    const sp = calls[0]!.body.payload.Body.SearchParameters as Record<string, unknown>
    expect(sp.ReturnCount).toBe(200)
    expect(sp.Offset).toBe(200)
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, pageSize: 200 })
  })

  it('does not send updatedAfter as an issue-date filter', async () => {
    const { calls } = fakeHttp(() => searchResponse([], 0))
    await adapter().listCreditMemos(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-01-01T00:00:00Z') }),
    )
    const sp = calls[0]!.body.payload.Body.SearchParameters as Record<string, unknown>
    expect(sp).not.toHaveProperty('IssueDateFrom')
  })

  it('refuses a response without the documented envelope (502)', async () => {
    fakeHttp(() => ({ payload: { Body: { Record: [row(1, -1)] } } }))
    await expect(
      adapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('QuickfileAdapter.getCreditMemo', () => {
  const detail = (total: number, type = 'INVOICE') => ({
    Invoice_Get: {
      Header: { MessageType: 'Response', SubmissionNumber: 'x' },
      Body: {
        InvoiceDetails: {
          InvoiceID: 7741492,
          InvoiceType: type,
          InvoiceNumber: '000057',
          IssueDate: '2017-06-07T00:00:00',
          ClientID: 1329095,
          Currency: 'GBP',
          TotalAmount: total,
          Status: 'SENT',
          ItemLines: {
            Item: [{ ItemLineID: 1, NominalCode: '4000', UnitCost: -320, Qty: 1, LineTotal: -320 }],
          },
        },
      },
    },
  })

  it('reads Invoice_Get.Body.InvoiceDetails for a numeric InvoiceID', async () => {
    const { calls } = fakeHttp(() => detail(-384))
    const cm = CreditMemoSchema.parse(await adapter().getCreditMemo(CREDS, '7741492'))
    expect(calls[0]!.path).toBe('invoice/get')
    expect(calls[0]!.body.payload.Body).toEqual({ InvoiceID: 7741492 })
    expect(cm.id).toBe('7741492')
    expect(cm.totalAmount).toBe(38400)
    expect(cm.lineItems?.[0]?.totalAmount).toBe(32000)
  })

  it('reads a one-line note, whose Item QuickFile sends as a bare object (t/16824)', async () => {
    const one = detail(-384)
    const d = one.Invoice_Get.Body.InvoiceDetails as Record<string, unknown>
    d.ItemLines = {
      Item: { ItemLineID: 1, NominalCode: '4000', UnitCost: -320, Qty: 1, LineTotal: -320 },
    }
    fakeHttp(() => one)
    const cm = CreditMemoSchema.parse(await adapter().getCreditMemo(CREDS, '7741492'))
    expect(cm.lineItems).toHaveLength(1)
    expect(cm.lineItems?.[0]?.totalAmount).toBe(32000)
  })

  it('answers 404 for an invoice that is not negative-value', async () => {
    fakeHttp(() => detail(384))
    await expect(adapter().getCreditMemo(CREDS, '7741492')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('answers 404 for an estimate', async () => {
    fakeHttp(() => detail(-384, 'ESTIMATE'))
    await expect(adapter().getCreditMemo(CREDS, '7741492')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('answers 404 without a request for an id that is not an InvoiceID', async () => {
    const { calls } = fakeHttp(() => detail(-384))
    await expect(adapter().getCreditMemo(CREDS, 'cn_abc')).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(calls).toHaveLength(0)
  })

  it('refuses a response without InvoiceDetails (502)', async () => {
    fakeHttp(() => ({ payload: { Body: { InvoiceData: { InvoiceID: 1, TotalAmount: -1 } } } }))
    await expect(adapter().getCreditMemo(CREDS, '1')).rejects.toMatchObject({ statusCode: 502 })
  })
})
