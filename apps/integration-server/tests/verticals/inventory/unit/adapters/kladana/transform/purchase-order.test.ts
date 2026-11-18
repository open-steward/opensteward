import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawKladanaPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/kladana/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const BASE_HREF = 'https://api.kladana.in/api/remap/1.2/entity'

describe('kladana transformPurchaseOrder', () => {
  const raw: RawKladanaPurchaseOrder = {
    id: 'po-uuid-001',
    name: 'ПЗ-001',
    agent: {
      meta: { href: `${BASE_HREF}/counterparty/sup-uuid-001` },
    },
    store: {
      meta: { href: `${BASE_HREF}/store/store-uuid-001` },
    },
    applicable: true,
    sum: 100000,
    moment: '2024-03-01T00:00:00Z',
    deliveryPlannedMoment: '2024-03-15T00:00:00Z',
    positions: {
      rows: [
        {
          assortment: {
            meta: { href: `${BASE_HREF}/product/prod-uuid-001` },
          },
          quantity: 10,
          shipped: 5,
          price: 10000,
          sum: 100000,
        },
      ],
    },
  }

  it('maps id from raw.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('po-uuid-001')
    expect(result.externalId).toBe('po-uuid-001')
  })

  it('maps number from name', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('ПЗ-001')
  })

  it('extracts supplierId from agent meta href', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-uuid-001')
  })

  it('extracts destinationLocationId from store meta href', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('store-uuid-001')
  })

  it('maps applicable=true to status sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps applicable=false to status draft', () => {
    const result = transformPurchaseOrder({ ...raw, applicable: false })
    expect(result.status).toBe('draft')
  })

  it('maps totalAmount from sum in kopecks', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(100000)
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(5)
    expect(result.lines[0].unitCost).toBe(10000)
    expect(result.lines[0].lineTotal).toBe(100000)
  })

  it('maps orderedAt from moment', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from deliveryPlannedMoment', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to kladana', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('kladana')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
