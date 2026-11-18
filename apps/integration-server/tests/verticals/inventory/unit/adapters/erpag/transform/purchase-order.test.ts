import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawErpagPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/erpag/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('erpag transformPurchaseOrder', () => {
  const raw: RawErpagPurchaseOrder = {
    id: 'erpag-po-001',
    purchaseOrder: {
      documentNumber: 'PO-1001',
      documentDate: '2024-03-01T00:00:00Z',
      referenceNo: 'REF-001',
      termsOfTrade: 'EXW',
      internationalTrade: false,
      dropShipping: false,
    },
    supplier: {
      key: 'sup-001',
      supplier: 'Best Supplier',
      eMail: 'orders@best.example',
      termsOfPayment: 'NET30',
    },
    amount: {
      purchaseAmount: 900.0,
      landingCost: 50.0,
      inputTax: 90.0,
      purchaseAmountTaxIncl: 990.0,
      total: 1000.0,
    },
    items: [
      {
        productsAndServices: { sku: 'WK-2026', description: 'Wireless Keyboard', key: 'prod-001' },
        defaultUom: { quantity: 10, uom: 'each' },
        price: 90.0,
        total: 900.0,
      },
    ],
  }

  it('maps id and externalId from id field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('erpag-po-001')
    expect(result.externalId).toBe('erpag-po-001')
  })

  it('maps number from purchaseOrder.documentNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-1001')
  })

  it('maps supplierId from supplier.key', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-001')
  })

  it('defaults status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps subtotalAmount from amount.purchaseAmount', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(900.0)
  })

  it('maps totalAmount from amount.total', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(1000.0)
  })

  it('maps lines from items array', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(90.0)
    expect(result.lines[0]!.lineTotal).toBe(900.0)
  })

  it('maps orderedAt from purchaseOrder.documentDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to supplier.supplier for supplierId when key is absent', () => {
    const result = transformPurchaseOrder({
      ...raw,
      supplier: { supplier: 'Best Supplier', eMail: 'orders@best.example' },
    })
    expect(result.supplierId).toBe('Best Supplier')
  })

  it('sets platform to erpag', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('erpag')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
