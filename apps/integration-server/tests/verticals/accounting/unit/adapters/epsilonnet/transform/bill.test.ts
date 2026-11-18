import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type EpsilonNetBill } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/bill'

function makeBill(overrides: Partial<EpsilonNetBill> = {}): EpsilonNetBill {
  return {
    id: '2001',
    invoiceNumber: 'BILL-2024-001',
    invoiceType: 'PurchaseInvoice',
    status: 'Draft',
    issueDate: '2024-03-01',
    dueDate: '2024-03-31',
    totalNetValue: 800,
    totalVatAmount: 192,
    totalGrossValue: 992,
    currency: 'EUR',
    counterpart: { vatNumber: 'EL111222333' },
    lines: [],
    ...overrides,
  }
}

describe('transformBill (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('2001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('EL111222333')
    expect(result.totalAmount).toBe(992)
    expect(result.taxAmount).toBe(192)
    expect(result.currency).toBe('EUR')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
    expect(result.dueAt).toEqual(new Date('2024-03-31'))
  })

  it('maps Draft to DRAFT', () => {
    const result = transformBill(makeBill({ status: 'Draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps Submitted to AUTHORIZED', () => {
    const result = transformBill(makeBill({ status: 'Submitted' }))
    expect(result.status).toBe('AUTHORIZED')
  })

  it('maps Cancelled to VOIDED', () => {
    const result = transformBill(makeBill({ status: 'Cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
