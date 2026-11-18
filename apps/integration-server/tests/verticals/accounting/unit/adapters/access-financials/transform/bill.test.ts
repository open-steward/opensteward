/**
 * Purchase transaction enquiry header → Bill.
 *
 * The fixture uses the fields the "Query Transaction Headers" example on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/purchase-transactions
 * selects ("accountCode accountName date ... transactionType headerRef
 * batched net tax description gross outstanding ... auditNo ... dueDate").
 * The page shows no response for it; the supplier code and name are the
 * ones the purchasing-transactions example answers with ("GB-S-1225",
 * "Hendrerit Industries").
 */
import { describe, it, expect } from 'vitest'
import { transformBill } from '../../../../../../../src/verticals/accounting/adapters/access-financials/transform/bill'
import { BillSchema } from '../../../../../../../src/verticals/accounting/schema/bill'
import { purchaseHeader } from '../fixtures'

describe('transformBill (access-financials)', () => {
  it('parses as a canonical Bill', () => {
    expect(() => BillSchema.parse(transformBill(purchaseHeader()))).not.toThrow()
  })

  it('maps auditNo, headerRef, description and the supplier', () => {
    const bill = transformBill(purchaseHeader())
    expect(bill.id).toBe('4120')
    expect(bill.billNumber).toBe('PI-4120')
    expect(bill.notes).toBe('May stationery')
    expect(bill.contactId).toBe('supp_GB-S-1225')
  })

  it('reads the purchase enquiry `date` field as the posting date', () => {
    const bill = transformBill(purchaseHeader())
    expect(bill.postedAt).toBe('2023-05-17')
    expect(bill.dueAt).toBe('2023-06-16')
  })

  it('reports no money and no currency', () => {
    const bill = transformBill(purchaseHeader())
    for (const k of [
      'currency',
      'totalAmount',
      'taxAmount',
      'paidAmount',
      'balanceAmount',
    ] as const) {
      expect(bill[k]).toBeUndefined()
    }
    expect(bill.metadata).toMatchObject({ gross: 1065.24 })
  })

  it('has no id when auditNo is null (the purchase enquiry types it `Int`)', () => {
    const bill = BillSchema.parse(transformBill(purchaseHeader({ auditNo: null })))
    expect(bill.id).toBeUndefined()
  })
})
