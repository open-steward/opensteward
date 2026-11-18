import { describe, it, expect } from 'vitest'
import { InvoiceSchema } from '../../../../../../../src/verticals/accounting/schema/invoice'
import { transformInvoice, type BusyInvoice } from '../../../../../../../src/verticals/accounting/adapters/busy/transform/invoice'

function makeRaw(overrides: Partial<BusyInvoice> = {}): BusyInvoice {
  return {
    VoucherNo: 'V-001',
    Date: '2024-03-01',
    DueDate: '2024-03-31',
    NetAmount: 1000,
    TaxAmount: 50,
    GrossAmount: 1050,
    Balance: 1050,
    Status: 'A',
    PartyCode: 'CUST001',
    CurrencyCode: 'AED',
    Items: [],
    ...overrides,
  }
}

describe('transformInvoice (busy)', () => {
  it('maps core fields correctly', () => {
    const result = transformInvoice(makeRaw())
    expect(result.id).toBe('V-001')
    expect(result.totalAmount).toBe(1050)
    expect(result.taxAmount).toBe(50)
    expect(result.currency).toBe('AED')
    expect(result.type).toBe('INVOICE')
  })

  it('maps invoiceNumber and contactId', () => {
    const result = transformInvoice(makeRaw())
    expect(result.invoiceNumber).toBe('V-001')
    expect(result.contactId).toBe('CUST001')
  })

  it('maps balanceAmount from Balance field', () => {
    const result = transformInvoice(makeRaw({ Balance: 500 }))
    expect(result.balanceAmount).toBe(500)
  })

  it('parses dates as Date objects', () => {
    const result = transformInvoice(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformInvoice(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status (P) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'P' })).status).toBe('DRAFT')
  })

  it('maps draft status (Draft) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps authorized status (A) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'A' })).status).toBe('AUTHORIZED')
  })

  it('maps authorized status (Approved) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status (C) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'C' })).status).toBe('PAID')
  })

  it('maps paid status (Closed) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'Closed' })).status).toBe('PAID')
  })

  it('maps voided status (X) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'X' })).status).toBe('VOIDED')
  })

  it('maps voided status (Cancelled) correctly', () => {
    expect(transformInvoice(makeRaw({ Status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('defaults unknown status to DRAFT', () => {
    expect(transformInvoice(makeRaw({ Status: 'unknown' })).status).toBe('DRAFT')
  })

  it('maps line items correctly', () => {
    const raw = makeRaw({
      Items: [
        {
          ItemCode: 'ITEM-1',
          Description: 'Test item',
          Qty: 2,
          Rate: 100,
          Amount: 200,
          TaxAmt: 10,
          AccountCode: 'ACC-001',
        },
      ],
    })
    const result = transformInvoice(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('ITEM-1')
    expect(result.lineItems![0].unitQuantity).toBe(2)
    expect(result.lineItems![0].totalAmount).toBe(200)
  })

  it('returns empty lineItems array when Items is empty', () => {
    const result = transformInvoice(makeRaw({ Items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('handles missing optional date fields', () => {
    const result = transformInvoice(makeRaw({ Date: '', DueDate: '' }))
    expect(result.postedAt).toBeUndefined()
    expect(result.dueAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformInvoice(makeRaw())
    expect(() => InvoiceSchema.parse(result)).not.toThrow()
  })
})
