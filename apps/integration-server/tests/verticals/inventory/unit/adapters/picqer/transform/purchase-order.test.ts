import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/picqer/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — picqer purchase order', () => {
  const raw = {
    idpurchaseorder: 500,
    idsupplier: 55,
    supplier_name: 'Keyboards Inc',
    supplier_orderid: 'SUP-REF-001',
    idwarehouse: 3,
    status: 'purchased',
    remarks: 'Urgent order',
    delivery_date: '2024-03-01T00:00:00Z',
    created: '2024-03-01T00:00:00Z',
    products: [
      {
        idproduct: 1001,
        amount: 100,
        amountreceived: 0,
        price: 49.99,
        productcode: 'WK-2026',
        name: 'Wireless Keyboard',
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from idpurchaseorder as string', () => {
    expect(result.id).toBe('500')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('500')
  })

  it('sets supplierId from idsupplier as string', () => {
    expect(result.supplierId).toBe('55')
  })

  it('sets destinationLocationId from idwarehouse', () => {
    expect(result.destinationLocationId).toBe('3')
  })

  it('maps status "purchased" → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('maps line items correctly', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('1001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(0)
    expect(result.lines[0]!.unitCost).toBe(49.99)
  })

  it('sets expectedAt from delivery_date', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets orderedAt from created', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to picqer', () => {
    expect(result.platform).toBe('picqer')
  })

  it('stores supplier_name in metadata', () => {
    expect(result.metadata['supplier_name']).toBe('Keyboards Inc')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (status: string) => ({
    idpurchaseorder: 99,
    idsupplier: 1,
    status,
    products: [],
  })

  it('maps "concept" → draft', () => {
    expect(transformPurchaseOrder(makeRaw('concept')).status).toBe('draft')
  })

  it('maps "received" → received', () => {
    expect(transformPurchaseOrder(makeRaw('received')).status).toBe('received')
  })

  it('maps "cancelled" → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw('cancelled')).status).toBe('cancelled')
  })

  it('maps unknown status → draft', () => {
    expect(transformPurchaseOrder(makeRaw('unknown_status')).status).toBe('draft')
  })
})

describe('transformPurchaseOrder — no supplier or products', () => {
  const result = transformPurchaseOrder({ idpurchaseorder: 1, status: 'concept' })

  it('sets supplierId to empty string when idsupplier absent', () => {
    expect(result.supplierId).toBe('')
  })

  it('sets lines to empty array when products absent', () => {
    expect(result.lines).toEqual([])
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
