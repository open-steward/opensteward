import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawApicbasePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('apicbase transformPurchaseOrder', () => {
  const raw: RawApicbasePurchaseOrder = {
    id: 'po-001',
    order_number: 'PO-2024-001',
    status: 'ORDERED',
    ordered_on: '2024-03-01T00:00:00Z',
    expected_delivery_date: '2024-03-01T00:00:00Z',
    theoretical_price: '250.00',
    supplier: { uid: 'sup-001' },
    outlet: { uid: 'outlet-001' },
    packages: [
      {
        stock_item: { uid: 'ing-001', name: 'Olive Oil' },
        supplier_package: {
          supplier_article_number: 'ART-001',
          theoretical_price_per_package: '50.00',
        },
        quantity_ordered: 5,
        total_theoretical_price: '250.00',
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-001')
    expect(result.externalId).toBe('po-001')
  })

  it('maps order number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps ORDERED status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps IN_PROGRESS status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'IN_PROGRESS' })
    expect(result.status).toBe('draft')
  })

  it('maps DELIVERED status to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'DELIVERED' })
    expect(result.status).toBe('received')
  })

  it('maps supplierId from nested supplier uid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-001')
  })

  it('converts totalAmount string decimal to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(25000)
  })

  it('maps line items with quantity and unit cost', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.quantityOrdered).toBe(5)
    expect(result.lines[0]!.unitCost).toBe(5000)
    expect(result.lines[0]!.lineTotal).toBe(25000)
  })

  it('sets platform to apicbase', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('apicbase')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
