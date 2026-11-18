/**
 * VosFactures billing documents over a mocked HTTP layer.
 *
 * Every billing document lives on GET /invoices.json and GET
 * /invoices/{id}.json (https://github.com/vosfactures/API). A customer credit
 * note is `kind` "correction" on the revenue side (`income` "1"); both are
 * documented list filters, as are `page`, `per_page` ("valeur maximale 100")
 * and `period` (default `last_12_months`, so `all` is sent). Amounts are
 * major-unit decimals in the document's `currency`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { VosfacturesAdapter } from '../../../../../../src/verticals/accounting/adapters/vosfactures'
import { CreditMemoSchema } from '../../../../../../src/verticals/accounting/schema/creditmemo'
import { InvoiceSchema } from '../../../../../../src/verticals/accounting/schema/invoice'
import { BillSchema } from '../../../../../../src/verticals/accounting/schema/bill'

const CREDS = { accessToken: 'tok_1', extra: { accountName: 'acme' } }

interface Call {
  method: 'get' | 'post' | 'put'
  path: string
  params?: Record<string, unknown>
  body?: unknown
}

function fakeHttp(respond: (call: Call) => unknown): { calls: Call[] } {
  const calls: Call[] = []
  const handle = (call: Call) => {
    calls.push(call)
    const data = respond(call)
    if (data instanceof Error) throw data
    return { data }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: async (path: string, cfg?: { params?: Record<string, unknown> }) =>
      handle({ method: 'get', path, params: cfg?.params }),
    post: async (path: string, body: unknown, cfg?: { params?: Record<string, unknown> }) =>
      handle({ method: 'post', path, params: cfg?.params, body }),
    put: async (path: string, body: unknown, cfg?: { params?: Record<string, unknown> }) =>
      handle({ method: 'put', path, params: cfg?.params, body }),
  } as never)
  return { calls }
}

function correction(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: `AV/${id}`,
    kind: 'correction',
    income: '1',
    status: 'issued',
    currency: 'EUR',
    price_gross: '-12,30',
    price_tax: '-2,30',
    paid: '0,00',
    invoice_id: 2432393,
    ...overrides,
  }
}

const adapter = () => new VosfacturesAdapter()

afterEach(() => vi.restoreAllMocks())

describe('VosfacturesAdapter capabilities', () => {
  it('declares the documented per_page maximum of 100', () => {
    expect(adapter().capabilities).toEqual({ maxPageSize: 100 })
  })
})

describe('VosfacturesAdapter.listCreditMemos', () => {
  it('asks for revenue corrections with the documented filters', async () => {
    const { calls } = fakeHttp(() => [correction(1)])
    await adapter().listCreditMemos(CREDS, { page: 2, limit: 10 })
    expect(calls).toEqual([
      {
        method: 'get',
        path: '/invoices.json',
        params: {
          api_token: 'tok_1',
          page: 2,
          per_page: 10,
          period: 'all',
          income: 1,
          kind: 'correction',
        },
      },
    ])
  })

  it('pages by the caller: page moves, per_page follows the limit up to 100', async () => {
    const { calls } = fakeHttp(() => [])
    await adapter().listCreditMemos(CREDS, { page: 1, limit: 7 })
    await adapter().listCreditMemos(CREDS, { page: 3, limit: 7 })
    await adapter().listCreditMemos(CREDS, { page: 1, limit: 500 })
    await adapter().listCreditMemos(CREDS, {})
    expect(calls.map((c) => [c.params?.['page'], c.params?.['per_page']])).toEqual([
      [1, 7],
      [3, 7],
      [1, 100],
      [1, 25],
    ])
  })

  it('does not send the undocumented search_date_type=updated_at for updatedAfter', async () => {
    const { calls } = fakeHttp(() => [])
    await adapter().listCreditMemos(CREDS, {
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    })
    expect(calls[0].params).not.toHaveProperty('search_date_type')
    expect(calls[0].params).not.toHaveProperty('date_from')
    expect(calls[0].params?.['period']).toBe('all')
  })

  it('returns schema-valid credit memos in minor units with appliedTo', async () => {
    fakeHttp(() => [correction(1), correction(2, { currency: 'JPY', price_gross: '-1000' })])
    const rows = await adapter().listCreditMemos(CREDS, { page: 1, limit: 10 })
    const parsed = rows.map((r) => CreditMemoSchema.parse(r))
    expect(parsed.map((r) => r.totalAmount)).toEqual([1230, 1000])
    expect(parsed[0].taxAmount).toBe(230)
    expect(parsed[0].appliedTo).toEqual([{ invoiceId: '2432393' }])
  })

  it('fails with 502 when the body is not an array of documents', async () => {
    fakeHttp(() => ({ error: 'nope' }))
    await expect(adapter().listCreditMemos(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
  })
})

describe('VosfacturesAdapter.getCreditMemo', () => {
  it('reads GET /invoices/{id}.json and returns a revenue correction', async () => {
    const { calls } = fakeHttp(() => correction(7))
    const memo = CreditMemoSchema.parse(await adapter().getCreditMemo(CREDS, '7'))
    expect(calls).toEqual([
      { method: 'get', path: '/invoices/7.json', params: { api_token: 'tok_1' } },
    ])
    expect(memo.id).toBe('7')
    expect(memo.totalAmount).toBe(1230)
    expect(memo.appliedTo).toEqual([{ invoiceId: '2432393' }])
  })

  it('also reads a document wrapped as { invoice }', async () => {
    fakeHttp(() => ({ invoice: correction(8) }))
    const memo = CreditMemoSchema.parse(await adapter().getCreditMemo(CREDS, '8'))
    expect(memo.id).toBe('8')
  })

  it.each([
    ['an invoice', { kind: 'vat' }],
    ['an estimate', { kind: 'estimate' }],
    ['an expense-side correction', { income: '0' }],
    ['a correction whose side is not reported', { income: undefined }],
  ])('404s on %s', async (_label, overrides) => {
    fakeHttp(() => correction(9, overrides))
    await expect(adapter().getCreditMemo(CREDS, '9')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('fails with 502 when the body is not a document', async () => {
    fakeHttp(() => ({}))
    await expect(adapter().getCreditMemo(CREDS, '9')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('encodes the id into the path', async () => {
    const { calls } = fakeHttp(() => correction(1))
    await adapter().getCreditMemo(CREDS, '1/../2')
    expect(calls[0].path).toBe('/invoices/1%2F..%2F2.json')
  })
})

describe('VosfacturesAdapter invoices and bills', () => {
  it('lists sales documents (income=1) over the whole history', async () => {
    const { calls } = fakeHttp(() => [
      { id: 1, kind: 'vat', income: '1', currency: 'EUR', price_gross: '72,57', paid: '0,00' },
    ])
    const rows = await adapter().listInvoices(CREDS, { page: 1, limit: 10 })
    expect(calls[0].params).toEqual({
      api_token: 'tok_1',
      page: 1,
      per_page: 10,
      period: 'all',
      income: 1,
    })
    expect(InvoiceSchema.parse(rows[0]).totalAmount).toBe(7257)
  })

  it('lists expense documents (income=0) as bills in minor units', async () => {
    const { calls } = fakeHttp(() => [
      { id: 2, kind: 'vat', income: '0', currency: 'EUR', price_gross: '369.99', paid: '0' },
    ])
    const rows = await adapter().listBills(CREDS, { page: 2, limit: 10 })
    expect(calls[0].params).toMatchObject({ page: 2, per_page: 10, period: 'all', income: 0 })
    expect(BillSchema.parse(rows[0]).totalAmount).toBe(36999)
  })

  it('reads a single invoice and bill at the top level', async () => {
    fakeHttp(() => ({ id: 3, kind: 'vat', income: '1', currency: 'EUR', price_gross: '10' }))
    expect(InvoiceSchema.parse(await adapter().getInvoice(CREDS, '3')).totalAmount).toBe(1000)
    expect(BillSchema.parse(await adapter().getBill(CREDS, '3')).totalAmount).toBe(1000)
  })

  it('writes line prices as major-unit decimals', async () => {
    const { calls } = fakeHttp(({ body }) => ({
      invoice: { id: 4, currency: 'EUR', ...(body as { invoice: object }).invoice },
    }))
    await adapter().createInvoice(CREDS, {
      currency: 'EUR',
      lineItems: [{ itemName: 'A', unitQuantity: 2, unitAmount: 5900 }],
    })
    await adapter().updateInvoice(CREDS, '4', {
      currency: 'JPY',
      lineItems: [{ itemName: 'B', unitQuantity: 1, unitAmount: 1000 }],
    })
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ['post', '/invoices.json'],
      ['put', '/invoices/4.json'],
    ])
    const price = (c: Call) =>
      (c.body as { invoice: { positions: Array<{ price_net: unknown }> } }).invoice.positions[0]
        .price_net
    expect(price(calls[0])).toBe(59)
    expect(price(calls[1])).toBe(1000)
  })

  it('reads a write response returned as the bare document', async () => {
    const { calls } = fakeHttp(() => ({
      id: 5,
      kind: 'vat',
      income: '1',
      currency: 'EUR',
      price_gross: '72,57',
    }))
    const created = InvoiceSchema.parse(await adapter().createInvoice(CREDS, { currency: 'EUR' }))
    const updated = InvoiceSchema.parse(
      await adapter().updateInvoice(CREDS, '5/x', { currency: 'EUR' }),
    )
    expect([created.id, created.totalAmount]).toEqual(['5', 7257])
    expect([updated.id, updated.totalAmount]).toEqual(['5', 7257])
    expect(calls[1].path).toBe('/invoices/5%2Fx.json')
  })

  it('fails a write with 502 when the response is not a document', async () => {
    fakeHttp(() => ({ code: 'error' }))
    await expect(adapter().createInvoice(CREDS, {})).rejects.toMatchObject({
      statusCode: 502,
      code: 'UPSTREAM_ERROR',
    })
    await expect(adapter().updateInvoice(CREDS, '1', {})).rejects.toMatchObject({
      statusCode: 502,
    })
  })
})
