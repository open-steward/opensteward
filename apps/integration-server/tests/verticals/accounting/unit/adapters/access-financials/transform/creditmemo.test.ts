/**
 * Sales transaction enquiry header (transactionType CreditNote) → CreditMemo.
 * Fixture provenance: see ./invoice.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/creditmemo'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { salesHeader } from '../fixtures'

const creditNote = () =>
  salesHeader({ auditNo: 158700, headerRef: '90060', transactionType: 'CreditNote', gross: -100 })

describe('transformCreditMemo (access-financials)', () => {
  it('parses as a canonical CreditMemo', () => {
    expect(() => CreditMemoSchema.parse(transformCreditMemo(creditNote()))).not.toThrow()
  })

  it('maps auditNo, headerRef and the customer', () => {
    const cm = transformCreditMemo(creditNote())
    expect(cm.id).toBe('158700')
    expect(cm.creditmemoNumber).toBe('90060')
    expect(cm.contactId).toBe('cust_GB-12672')
    expect(cm.postedAt).toBe('2024-04-29')
  })

  it('maps dueDate to dueAt as a calendar date', () => {
    expect(transformCreditMemo(salesHeader({ dueDate: '2024-05-29' })).dueAt).toBe('2024-05-29')
  })

  it('reports no money and no currency', () => {
    const cm = transformCreditMemo(creditNote())
    expect(cm.currency).toBeUndefined()
    expect(cm.totalAmount).toBeUndefined()
    expect(cm.balanceAmount).toBeUndefined()
    expect(cm.status).toBeUndefined()
  })
})
