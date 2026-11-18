/**
 * Sales transaction enquiry header (any transactionType) → Transaction.
 * Fixture provenance: see ./invoice.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { transformTransaction } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { salesHeader } from '../fixtures'

describe('transformTransaction (access-financials)', () => {
  it('parses as a canonical Transaction', () => {
    expect(() => TransactionSchema.parse(transformTransaction(salesHeader()))).not.toThrow()
  })

  it('keeps the documented transactionType as the type', () => {
    expect(transformTransaction(salesHeader({ transactionType: 'Receipt' })).type).toBe('Receipt')
  })

  it('maps auditNo, headerRef, description, date and the customer', () => {
    const tx = transformTransaction(salesHeader({ transactionDescription: 'April services' }))
    expect(tx.id).toBe('158658')
    expect(tx.reference).toBe('90052')
    expect(tx.memo).toBe('April services')
    expect(tx.postedAt).toBe('2024-04-29')
    expect(tx.contacts).toEqual([{ id: 'cust_GB-12672', name: 'Example Customer' }])
  })

  it('has no contact when the row has no account code', () => {
    expect(transformTransaction(salesHeader({ accountCode: null })).contacts).toBeUndefined()
  })

  it('reports no money and no currency', () => {
    const tx = transformTransaction(salesHeader())
    expect(tx.currency).toBeUndefined()
    expect(tx.totalAmount).toBeUndefined()
    expect(tx.subTotalAmount).toBeUndefined()
    expect(tx.taxAmount).toBeUndefined()
  })
})
