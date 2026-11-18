import { describe, it, expect } from 'vitest'
import { CreditMemoSchema } from '../../../../../../../src/verticals/accounting/schema/creditmemo'
import {
  transformCreditMemo,
  type QBOCreditMemo,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/creditmemo'

function makeCreditMemo(overrides: Partial<QBOCreditMemo> = {}): QBOCreditMemo {
  return {
    Id: '88',
    DocNumber: 'CM-2024-001',
    CustomerRef: { value: '20' },
    TxnDate: '2024-03-10',
    TotalAmt: 600,
    Balance: 600,
    RemainingCredit: 600,
    CurrencyRef: { value: 'USD' },
    Line: [],
    ...overrides,
  }
}

describe('transformCreditMemo', () => {
  it('maps Id to id', () => {
    expect(transformCreditMemo(makeCreditMemo()).id).toBe('88')
  })

  it('maps DocNumber to creditmemoNumber', () => {
    expect(transformCreditMemo(makeCreditMemo()).creditmemoNumber).toBe('CM-2024-001')
  })

  it('maps CustomerRef.value to contactId', () => {
    expect(transformCreditMemo(makeCreditMemo()).contactId).toBe('20')
  })

  it('maps CurrencyRef.value to currency', () => {
    expect(transformCreditMemo(makeCreditMemo()).currency).toBe('USD')
  })

  it('maps TotalAmt to totalAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).totalAmount).toBe(600)
  })

  it('maps Balance to balanceAmount', () => {
    expect(transformCreditMemo(makeCreditMemo()).balanceAmount).toBe(600)
  })

  it('parses TxnDate as postedAt Date', () => {
    expect(transformCreditMemo(makeCreditMemo()).postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps AUTHORIZED status when RemainingCredit equals TotalAmt', () => {
    expect(transformCreditMemo(makeCreditMemo()).status).toBe('AUTHORIZED')
  })

  it('maps PAID status when RemainingCredit is zero', () => {
    expect(transformCreditMemo(makeCreditMemo({ RemainingCredit: 0 })).status).toBe('PAID')
  })

  it('maps PARTIALLY_PAID status when RemainingCredit is partial', () => {
    expect(transformCreditMemo(makeCreditMemo({ RemainingCredit: 300 })).status).toBe('PARTIALLY_PAID')
  })

  it('maps lines with SalesItemLineDetail', () => {
    const raw = makeCreditMemo({
      Line: [
        {
          Id: 'L1',
          Description: 'Widget refund',
          Amount: 600,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { ItemRef: { value: 'item_1' }, UnitPrice: 600, Qty: 1 },
        },
      ],
    })
    const cm = transformCreditMemo(raw)
    expect(cm.lineItems).toHaveLength(1)
    expect(cm.lineItems![0].itemId).toBe('item_1')
    expect(cm.lineItems![0].totalAmount).toBe(600)
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
