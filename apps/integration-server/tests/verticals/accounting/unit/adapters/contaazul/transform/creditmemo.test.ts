import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type ContaAzulCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/creditmemo'

function makeCreditMemo(overrides: Partial<ContaAzulCreditMemo> = {}): ContaAzulCreditMemo {
  return {
    id: 'cm-001',
    number: 'NC-200',
    issue_date: '2025-06-01',
    due_date: '2025-07-01',
    customer_id: 'cust-100',
    total: 4000,
    tax_total: 720,
    balance: 1500,
    paid_amount: 2500,
    currency: 'BRL',
    status: 'authorized',
    items: [
      { id: 'li-1', description: 'Devolucao', quantity: 2, unit_price: 2000, total: 4000, tax_amount: 720, account_id: 'acc-5', product_id: 'prod-2', discount: 0 },
    ],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('cm-001')
    expect(result.creditmemoNumber).toBe('NC-200')
    expect(result.contactId).toBe('cust-100')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(4000)
    expect(result.taxAmount).toBe(720)
    expect(result.balanceAmount).toBe(1500)
    expect(result.paidAmount).toBe(2500)
  })

  it('maps status values', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'paid' })).status).toBe('PAID')
    expect(transformCreditMemo(makeCreditMemo({ status: 'liquidated' })).status).toBe('PAID')
    expect(transformCreditMemo(makeCreditMemo({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformCreditMemo(makeCreditMemo({ status: 'cancelled' })).status).toBe('VOIDED')
    expect(transformCreditMemo(makeCreditMemo({ status: 'partially_paid' })).status).toBe('PARTIALLY_PAID')
    expect(transformCreditMemo(makeCreditMemo({ status: 'confirmed' })).status).toBe('AUTHORIZED')
    expect(transformCreditMemo(makeCreditMemo({ status: '' })).status).toBe('DRAFT')
  })

  it('maps line items', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0].itemDescription).toBe('Devolucao')
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
