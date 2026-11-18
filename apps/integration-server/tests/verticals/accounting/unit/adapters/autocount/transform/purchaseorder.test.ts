import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type AutocountPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/purchaseorder'

function makeRaw(overrides: Partial<AutocountPurchaseOrder> = {}): AutocountPurchaseOrder {
  return {
    DocNo: 'PO-001',
    DocDate: '2024-03-01',
    DueDate: '2024-03-31',
    SubTotal: 3000,
    TaxAmt: 180,
    DocAmt: 3180,
    CreditorCode: 'CR001',
    CreditorName: 'Vendor Sdn Bhd',
    Cancelled: false,
    Status: 0,
    DetailItems: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-001')
    expect(result.contactId).toBe('CR001')
    expect(result.totalAmount).toBe(3180)
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps Status 0 to ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 0 }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps Status 2 to COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 2 }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformPurchaseOrder(makeRaw({ Cancelled: true }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps DetailItems to lineItems', () => {
    const raw = makeRaw({
      DetailItems: [
        {
          Seq: 1,
          ItemCode: 'RAW-001',
          Description: 'Raw material',
          Qty: 100,
          UnitPrice: 30,
          Amount: 3000,
          TaxAmt: 180,
          TaxCode: 'TX',
          AccNo: '500-000',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(3000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
