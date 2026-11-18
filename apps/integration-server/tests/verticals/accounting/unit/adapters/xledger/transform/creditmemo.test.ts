/**
 * Fixture is the credit-note node of the "Customer invoices" article's "Part
 * refund/credit" example
 * (https://xledgerukinternal.zendesk.com/hc/en-us/articles/8703588077330).
 */
import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import { transformCreditMemo } from '../../../../../../../src/verticals/accounting/adapters/xledger/transform/creditmemo'
import type { XledgerSubledgerTransaction } from '../../../../../../../src/verticals/accounting/adapters/xledger/relay'

const CREDIT_FOR_C1: XledgerSubledgerTransaction = {
  dbId: 139977189,
  invoiceNumber: 'Credit note for C1',
  invoiceRemaining: '0.0000',
  invoiceAmount: '-50.0000',
  reconciled: false,
  extIdentifier: '1000239',
}

describe('transformCreditMemo (Xledger arTransactions node)', () => {
  it('maps the documented node to a canonical credit memo', () => {
    const result = CreditMemoSchema.parse(transformCreditMemo(CREDIT_FOR_C1))
    expect(result.id).toBe('139977189')
    expect(result.creditmemoNumber).toBe('Credit note for C1')
  })

  it('invents no money, currency or status the node does not document', () => {
    const result = transformCreditMemo(CREDIT_FOR_C1)
    expect(result.currency).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(result.metadata).toBe(CREDIT_FOR_C1)
  })
})
