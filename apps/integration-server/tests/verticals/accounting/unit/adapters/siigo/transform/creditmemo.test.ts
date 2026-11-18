import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type SiigoCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/creditmemo'

function makeCreditMemo(overrides: Partial<SiigoCreditMemo> = {}): SiigoCreditMemo {
  return {
    id: 600,
    prefix: 'NC',
    number: 100,
    date: '2025-06-01',
    dueDate: '2025-07-01',
    customerId: 300,
    total: 5000,
    taxTotal: 950,
    balance: 2000,
    paidAmount: 3000,
    currency: 'COP',
    status: 'authorized',
    items: [
      { id: 1, description: 'Refund item', quantity: 1, price: 5000, total: 5000, taxAmount: 950, accountId: 10, productId: 'P1', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('600')
    expect(result.creditmemoNumber).toBe('NC-100')
    expect(result.contactId).toBe('300')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(5000)
    expect(result.taxAmount).toBe(950)
    expect(result.balanceAmount).toBe(2000)
    expect(result.paidAmount).toBe(3000)
  })

  it('maps status values', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformCreditMemo(makeCreditMemo({ status: 'approved' })).status).toBe('AUTHORIZED')
    expect(transformCreditMemo(makeCreditMemo({ status: '' })).status).toBe('DRAFT')
  })

  it('maps line items', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemDescription).toBe('Refund item')
  })

  it('passes raw object as metadata', () => {
    const raw = makeCreditMemo()
    expect(transformCreditMemo(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(() => CreditMemoSchema.parse(result)).not.toThrow()
  })
})
