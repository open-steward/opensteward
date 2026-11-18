import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type SiigoBill } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/bill'

function makeBill(overrides: Partial<SiigoBill> = {}): SiigoBill {
  return {
    id: 500,
    name: 'Purchase Bill',
    prefix: 'FV',
    number: 1234,
    date: '2025-03-15',
    dueDate: '2025-04-15',
    supplierId: 200,
    total: 10000,
    taxTotal: 1900,
    balance: 5000,
    currency: 'COP',
    status: 'paid',
    items: [
      { id: 1, description: 'Item A', quantity: 2, price: 4050, total: 8100, taxAmount: 1539, accountId: 10, productId: 'P1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('500')
    expect(result.billNumber).toBe('FV-1234')
    expect(result.contactId).toBe('200')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(10000)
    expect(result.taxAmount).toBe(1900)
    expect(result.balanceAmount).toBe(5000)
  })

  it('maps dates correctly', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2025-03-15'))
    expect(result.dueAt).toEqual(new Date('2025-04-15'))
  })

  it('maps status values', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformBill(makeBill({ status: 'annulled' })).status).toBe('VOIDED')
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformBill(makeBill({ status: 'authorized' })).status).toBe('AUTHORIZED')
    expect(transformBill(makeBill({ status: 'approved' })).status).toBe('AUTHORIZED')
    expect(transformBill(makeBill({ status: '' })).status).toBe('DRAFT')
  })

  it('maps line items', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('1')
    expect(result.lineItems?.[0].unitAmount).toBe(4050)
    expect(result.lineItems?.[0].unitQuantity).toBe(2)
  })

  it('formats billNumber without prefix', () => {
    const result = transformBill(makeBill({ prefix: '' }))
    expect(result.billNumber).toBe('1234')
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
