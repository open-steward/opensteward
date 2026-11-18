import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import {
  transformPurchaseOrder,
  type EcountPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/ecount/transform/purchaseorder'

function makeRaw(overrides: Partial<EcountPurchaseOrder> = {}): EcountPurchaseOrder {
  return {
    ORDER_NO: 'PO-2024-001',
    ORDER_DATE: '2024-01-10',
    DUE_DATE: '2024-02-10',
    CUST_CODE: 'VEND-001',
    CUST_NAME: 'Supplier Korea Co',
    TOTAL_AMT: 88000,
    VAT_AMT: 8000,
    STATUS: '01',
    ITEM_LIST: [],
    ...overrides,
  }
}

describe('transformPurchaseOrder (Ecount)', () => {
  it('maps core fields correctly', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-2024-001')
    expect(result.contactId).toBe('VEND-001')
    expect(result.totalAmount).toBe(88000)
  })

  it('parses date as Date object', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-10'))
  })

  it('maps STATUS 03 to COMPLETED', () => {
    const result = transformPurchaseOrder(makeRaw({ STATUS: '03' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('maps STATUS 04 to CANCELLED', () => {
    const result = transformPurchaseOrder(makeRaw({ STATUS: '04' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    const result = transformPurchaseOrder(makeRaw({ STATUS: '01' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformPurchaseOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps ITEM_LIST to lineItems', () => {
    const raw = makeRaw({
      ITEM_LIST: [
        {
          PROD_CODE: 'RAW-001',
          PROD_NAME: 'Raw material',
          QTY: 100,
          PRICE: 800,
          SUPPLY_AMT: 80000,
          VAT_AMT: 8000,
          AMOUNT: 80000,
          ACCOUNT_CODE: 'INV-001',
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].itemId).toBe('RAW-001')
    expect(result.lineItems![0].totalAmount).toBe(80000)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
