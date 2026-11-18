/**
 * Fixture is the "Supplier invoices" article's "Fully paid" example node
 * (https://xledgerukinternal.zendesk.com/hc/en-us/articles/8714771914898).
 */
import { describe, it, expect } from 'vitest'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/xledger/transform/bill'
import type { XledgerSubledgerTransaction } from '../../../../../../../src/verticals/accounting/adapters/xledger/relay'

const BILL_A: XledgerSubledgerTransaction = {
  dbId: 139977188,
  invoiceNumber: 'A',
  invoiceRemaining: '0.0000',
  invoiceAmount: '200.0000',
  reconciled: true,
  extIdentifier: '1000239',
}

describe('transformBill (Xledger apTransactions node)', () => {
  it('maps the documented node to a canonical bill', () => {
    const result = BillSchema.parse(transformBill(BILL_A))
    expect(result.id).toBe('139977188')
    expect(result.billNumber).toBe('A')
  })

  it('invents no money, currency or status the node does not document', () => {
    const result = transformBill(BILL_A)
    expect(result.currency).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.balanceAmount).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(result.metadata).toBe(BILL_A)
  })
})
