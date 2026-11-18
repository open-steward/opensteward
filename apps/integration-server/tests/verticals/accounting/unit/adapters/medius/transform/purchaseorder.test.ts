import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type MediusPurchaseOrder,
} from '../../../../../../../src/verticals/accounting/adapters/medius/transform/purchaseorder'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'

function makePO(overrides: Partial<MediusPurchaseOrder> = {}): MediusPurchaseOrder {
  return {
    orderIdentifier: 'PO-2001',
    supplierId: 'sup_001',
    currencyCode: 'USD',
    amount: 500.0,
    registerDate: '2024-02-15T00:00:00.000Z',
    isActive: true,
    ...overrides,
  }
}

describe('transformPurchaseOrder (medius)', () => {
  it('maps orderIdentifier to id', () => {
    expect(transformPurchaseOrder(makePO()).id).toBe('PO-2001')
  })

  it('falls back to mediusFlowSystemId when orderIdentifier is absent', () => {
    const result = transformPurchaseOrder(
      makePO({ orderIdentifier: undefined, mediusFlowSystemId: 'mf_77' }),
    )
    expect(result.id).toBe('mf_77')
  })

  it('maps supplierId to contactId', () => {
    expect(transformPurchaseOrder(makePO()).contactId).toBe('sup_001')
  })

  it('prefers supplierGlobalId over supplierId for contactId when supplierId absent', () => {
    const result = transformPurchaseOrder(
      makePO({ supplierId: undefined, supplierGlobalId: 'gid_9' }),
    )
    expect(result.contactId).toBe('gid_9')
  })

  it('maps currencyCode to currency', () => {
    expect(transformPurchaseOrder(makePO()).currency).toBe('USD')
  })

  it('converts decimal amount to integer minor units', () => {
    // 500.00 * 100 = 50000
    expect(transformPurchaseOrder(makePO()).totalAmount).toBe(50000)
  })

  it('maps registerDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makePO()).postedAt).toEqual(new Date('2024-02-15T00:00:00.000Z'))
  })

  it('maps isActive=true to ACTIVE status', () => {
    expect(transformPurchaseOrder(makePO({ isActive: true })).status).toBe('ACTIVE')
  })

  it('maps isActive=false to COMPLETED status', () => {
    expect(transformPurchaseOrder(makePO({ isActive: false })).status).toBe('COMPLETED')
  })

  it('maps line items with derived total from unitPrice * quantity', () => {
    const raw = makePO({
      purchaseOrderLines: [
        {
          lineNumber: 'L1',
          itemNumber: 'PART-99',
          itemDescription: 'Widget',
          quantity: 3,
          unitPrice: 10.0,
        },
      ],
    })
    const result = transformPurchaseOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('L1')
    expect(li.unitAmount).toBe(1000) // 10.00 * 100
    expect(li.unitQuantity).toBe(3)
    // derived: 1000 * 3 = 3000
    expect(li.totalAmount).toBe(3000)
  })

  it('maps line item with explicit amount field', () => {
    const raw = makePO({
      purchaseOrderLines: [{ lineNumber: 'L2', amount: 25.5, quantity: 1, unitPrice: 25.5 }],
    })
    const result = transformPurchaseOrder(raw)
    const li = result.lineItems![0]
    // explicit amount: 25.5 * 100 = 2550
    expect(li.totalAmount).toBe(2550)
  })

  it('passes raw object as metadata', () => {
    const raw = makePO()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('passes PurchaseOrderSchema validation', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(makePO()))).not.toThrow()
  })
})
