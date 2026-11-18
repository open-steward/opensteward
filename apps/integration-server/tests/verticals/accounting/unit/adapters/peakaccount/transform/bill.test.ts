import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type PeakAccountBill } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/bill'

function makeBill(overrides: Partial<PeakAccountBill> = {}): PeakAccountBill {
  return {
    id: 'BILL-001',
    documentNo: 'BILL-2024-001',
    status: 'approved',
    issueDate: '2024-01-10',
    dueDate: '2024-02-10',
    totalAmount: 5350,
    vatAmount: 350,
    currency: 'THB',
    contactId: 'SUPP-001',
    items: [],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('BILL-001')
    expect(result.billNumber).toBe('BILL-2024-001')
    expect(result.contactId).toBe('SUPP-001')
    expect(result.totalAmount).toBe(5350)
    expect(result.taxAmount).toBe(350)
    expect(result.currency).toBe('THB')
  })

  it('parses dates as Date objects', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
    expect(result.dueAt).toEqual(new Date('2024-02-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeBill()
    const result = transformBill(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps draft status to DRAFT', () => {
    expect(transformBill(makeBill({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps approved status to AUTHORIZED', () => {
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
  })

  it('maps paid status to PAID', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
  })

  it('maps cancelled status to VOIDED', () => {
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps items to lineItems', () => {
    const raw = makeBill({
      items: [
        {
          id: 'ITEM-1',
          description: 'Office Supplies',
          quantity: 1,
          unitPrice: 5000,
          amount: 5000,
          vatAmount: 350,
          accountCode: '5100',
        },
      ],
    })
    const result = transformBill(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].id).toBe('ITEM-1')
    expect(result.lineItems![0].totalAmount).toBe(5000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformBill(makeBill())
    expect(() => BillSchema.parse(result)).not.toThrow()
  })
})
