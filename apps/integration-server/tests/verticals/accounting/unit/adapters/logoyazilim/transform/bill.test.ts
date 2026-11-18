import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type LogoBill } from '../../../../../../../src/verticals/accounting/adapters/logoyazilim/transform/bill'

function makeBill(overrides: Partial<LogoBill> = {}): LogoBill {
  return {
    id: '2001',
    InvoiceNumber: 'PUR-2024-001',
    InvoiceDate: '2024-02-01',
    DueDate: '2024-03-01',
    TotalAmount: 5900,
    TaxAmount: 900,
    Status: 'Draft',
    CurrencyCode: 'TRY',
    ContactId: '55',
    Type: 'Purchase',
    ...overrides,
  }
}

describe('transformBill (logoyazilim)', () => {
  it('maps id correctly', () => {
    expect(transformBill(makeBill()).id).toBe('2001')
  })

  it('maps billNumber from InvoiceNumber', () => {
    expect(transformBill(makeBill()).billNumber).toBe('PUR-2024-001')
  })

  it('maps totalAmount and taxAmount', () => {
    const b = transformBill(makeBill())
    expect(b.totalAmount).toBe(5900)
    expect(b.taxAmount).toBe(900)
  })

  it('maps contactId from ContactId', () => {
    expect(transformBill(makeBill()).contactId).toBe('55')
  })

  it('maps Draft status to DRAFT', () => {
    expect(transformBill(makeBill({ Status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps Approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ Status: 'Approved' })).status).toBe('AUTHORIZED')
  })

  it('maps Paid status to PAID', () => {
    expect(transformBill(makeBill({ Status: 'Paid' })).status).toBe('PAID')
  })

  it('maps Cancelled status to VOIDED', () => {
    expect(transformBill(makeBill({ Status: 'Cancelled' })).status).toBe('VOIDED')
  })

  it('parses dates as Date objects', () => {
    const b = transformBill(makeBill())
    expect(b.postedAt).toEqual(new Date('2024-02-01'))
    expect(b.dueAt).toEqual(new Date('2024-03-01'))
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
