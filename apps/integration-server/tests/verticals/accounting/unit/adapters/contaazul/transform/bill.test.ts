import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill, type ContaAzulBill } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/bill'

function makeBill(overrides: Partial<ContaAzulBill> = {}): ContaAzulBill {
  return {
    id: 'bill-001',
    number: 'NF-5000',
    issue_date: '2025-03-10',
    due_date: '2025-04-10',
    supplier_id: 'sup-100',
    total: 12000,
    tax_total: 2160,
    balance: 6000,
    currency: 'BRL',
    status: 'paid',
    items: [
      { id: 'li-1', description: 'Servico A', quantity: 3, unit_price: 4000, total: 12000, tax_amount: 2160, account_id: 'acc-10', product_id: 'prod-1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformBill', () => {
  it('maps core fields correctly', () => {
    const result = transformBill(makeBill())
    expect(result.id).toBe('bill-001')
    expect(result.billNumber).toBe('NF-5000')
    expect(result.contactId).toBe('sup-100')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(12000)
    expect(result.taxAmount).toBe(2160)
    expect(result.balanceAmount).toBe(6000)
  })

  it('maps dates', () => {
    const result = transformBill(makeBill())
    expect(result.postedAt).toEqual(new Date('2025-03-10'))
    expect(result.dueAt).toEqual(new Date('2025-04-10'))
  })

  it('maps status values', () => {
    expect(transformBill(makeBill({ status: 'paid' })).status).toBe('PAID')
    expect(transformBill(makeBill({ status: 'liquidated' })).status).toBe('PAID')
    expect(transformBill(makeBill({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformBill(makeBill({ status: 'cancelled' })).status).toBe('VOIDED')
    expect(transformBill(makeBill({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformBill(makeBill({ status: 'confirmed' })).status).toBe('AUTHORIZED')
    expect(transformBill(makeBill({ status: '' })).status).toBe('DRAFT')
  })

  it('maps line items', () => {
    const result = transformBill(makeBill())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].id).toBe('li-1')
    expect(result.lineItems?.[0].unitAmount).toBe(4000)
    expect(result.lineItems?.[0].accountId).toBe('acc-10')
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
