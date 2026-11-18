import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import {
  transformBill,
  type FortnoxSupplierInvoice,
} from '../../../../../../../src/verticals/accounting/adapters/fortnox/transform/bill'

function makeBill(overrides: Partial<FortnoxSupplierInvoice> = {}): FortnoxSupplierInvoice {
  return {
    GivenNumber: '55',
    InvoiceNumber: 'SUPP-2024-001',
    SupplierNumber: '10',
    SupplierName: 'Supplier AB',
    Total: 5000,
    VAT: 1000,
    Balance: 5000,
    Currency: 'SEK',
    InvoiceDate: '2024-02-01',
    DueDate: '2024-03-01',
    Booked: false,
    Cancelled: false,
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps GivenNumber to id', () => {
    expect(transformBill(makeBill()).id).toBe('55')
  })

  it('maps InvoiceNumber to billNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('SUPP-2024-001')
  })

  it('maps SupplierNumber to contactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('supp_10')
  })

  it('maps amounts correctly', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(500000)
    expect(b.taxAmount).toBe(100000)
    expect(b.balanceAmount).toBe(500000)
    expect(b.currency).toBe('SEK')
  })

  it('maps dates as Date objects', () => {
    const b = transformBill(makeBill())
    expect(b.postedAt).toEqual(new Date('2024-02-01'))
    expect(b.dueAt).toEqual(new Date('2024-03-01'))
  })

  it('maps DRAFT status', () => {
    expect(transformBill(makeBill({ Booked: false })).status).toBe('DRAFT')
  })

  it('maps AUTHORIZED status', () => {
    expect(transformBill(makeBill({ Booked: true, Balance: 5000 })).status).toBe('AUTHORIZED')
  })

  it('maps PAID status', () => {
    expect(transformBill(makeBill({ Booked: true, Balance: 0 })).status).toBe('PAID')
  })

  it('maps VOIDED status', () => {
    expect(transformBill(makeBill({ Cancelled: true })).status).toBe('VOIDED')
  })

  it('passes raw object as metadata', () => {
    const raw = makeBill()
    expect(transformBill(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
