import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo, type BCSalesCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/dynamics365bc/transform/creditmemo'

function makeCreditMemo(overrides: Partial<BCSalesCreditMemo> = {}): BCSalesCreditMemo {
  return {
    id: 'cm-1',
    number: 'SCM-001',
    customerId: 'cust-1',
    currencyCode: 'GBP',
    totalAmountIncludingTax: 600,
    totalTaxAmount: 100,
    remainingAmountIncludingTax: 600,
    status: 'Open',
    ...overrides,
  }
}

describe('transformCreditMemo (dynamics365bc)', () => {
  it('maps id and creditmemoNumber', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.id).toBe('cm-1')
    expect(result.creditmemoNumber).toBe('SCM-001')
  })

  it('maps contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('cust-1')
  })

  it('Draft → DRAFT', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('Open → AUTHORIZED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Open' })).status).toBe('AUTHORIZED')
  })

  it('Paid → PAID', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Paid' })).status).toBe('PAID')
  })

  it('Canceled → VOIDED', () => {
    expect(transformCreditMemo(makeCreditMemo({ status: 'Canceled' })).status).toBe('VOIDED')
  })

  it('maps totalAmount and taxAmount', () => {
    const result = transformCreditMemo(makeCreditMemo())
    expect(result.totalAmount).toBe(600)
    expect(result.taxAmount).toBe(100)
  })

  it('maps lineItems', () => {
    const cm = makeCreditMemo({
      salesCreditMemoLines: [
        { id: 'li-1', description: 'Return', quantity: 1, unitPrice: 600, taxAmount: 100, totalAmountIncludingTax: 600 },
      ],
    })
    expect(transformCreditMemo(cm).lineItems).toHaveLength(1)
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
