import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/prediko/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — prediko order', () => {
  const raw = {
    id: 'ord_001',
    reference: 'PO-1042',
    order_status: 'CONFIRMED',
    supplier_name: 'Keyboards Inc',
    order_type: 'standard',
    currency: 'USD',
    cost: 4500,
    quantity_confirmed: 100,
    quantity_received: 0,
    delivery_date: ['2024-03-01T00:00:00Z'],
    created_at: '2024-03-01T00:00:00Z',
    warehouse_names: ['Main Warehouse'],
    order_parts: [
      {
        id: 'part_1',
        sku_name: 'WK-2026',
        product_name: 'Wireless Keyboard',
        warehouse_name: 'Main Warehouse',
        supplier_name: 'Keyboards Inc',
        quantity_confirmed: 100,
        received: 0,
        in_transit: 0,
        total_cost: 4500,
        confirmed_delivery_date: '2024-03-01T00:00:00Z',
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from raw.id', () => {
    expect(result.id).toBe('ord_001')
  })

  it('sets externalId matching id', () => {
    expect(result.externalId).toBe('ord_001')
  })

  it('sets number from reference', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('sets supplierId from supplier_name (name used as id)', () => {
    expect(result.supplierId).toBe('Keyboards Inc')
  })

  it('sets destinationLocationId from first warehouse_name', () => {
    expect(result.destinationLocationId).toBe('Main Warehouse')
  })

  it('maps status "CONFIRMED" → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('sets currency', () => {
    expect(result.currency).toBe('USD')
  })

  it('sets totalAmount from cost', () => {
    expect(result.totalAmount).toBe(4500)
  })

  it('maps order_parts to lines with sku_name as productId', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WK-2026')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(0)
    expect(result.lines[0]!.lineTotal).toBe(4500)
  })

  it('sets expectedAt from first delivery_date entry', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets orderedAt from created_at', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to prediko', () => {
    expect(result.platform).toBe('prediko')
  })

  it('stores orderType in metadata', () => {
    expect(result.metadata['orderType']).toBe('standard')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (order_status: string) => ({
    id: 'ord_x',
    order_status,
    supplier_name: 'Supplier',
    order_parts: [],
  })

  it('maps "DRAFT" → draft', () => {
    expect(transformPurchaseOrder(makeRaw('DRAFT')).status).toBe('draft')
  })

  it('maps "SENT_FOR_APPROVAL" → sent', () => {
    expect(transformPurchaseOrder(makeRaw('SENT_FOR_APPROVAL')).status).toBe('sent')
  })

  it('maps "APPROVED" → sent', () => {
    expect(transformPurchaseOrder(makeRaw('APPROVED')).status).toBe('sent')
  })

  it('maps "PARTIALLY_RECEIVED" → partially_received', () => {
    expect(transformPurchaseOrder(makeRaw('PARTIALLY_RECEIVED')).status).toBe('partially_received')
  })

  it('maps "FULLY_RECEIVED" → received', () => {
    expect(transformPurchaseOrder(makeRaw('FULLY_RECEIVED')).status).toBe('received')
  })

  it('maps unknown → draft', () => {
    expect(transformPurchaseOrder(makeRaw('UNKNOWN')).status).toBe('draft')
  })
})

describe('transformPurchaseOrder — delivery_date fallback to confirmed_delivery_date', () => {
  const result = transformPurchaseOrder({
    id: 'ord_2',
    supplier_name: 'Sup',
    order_parts: [],
    confirmed_delivery_date: ['2024-03-01T00:00:00Z'],
  })

  it('falls back expectedAt to confirmed_delivery_date when delivery_date absent', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })
})
