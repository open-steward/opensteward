import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOpenboxesPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/openboxes/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('openboxes transformPurchaseOrder', () => {
  const raw: RawOpenboxesPurchaseOrder = {
    id: 'sm-001',
    identifier: 'SM-2024-001',
    name: 'Inbound from Keyboards Inc',
    description: 'Q1 restock',
    status: 'CREATED',
    statusCode: 'CREATED',
    origin: { id: 'sup-001', name: 'Keyboards Inc' },
    destination: { id: 'loc-001', name: 'Main Warehouse' },
    requestedBy: { id: 'user-1', name: 'Jane Doe' },
    dateRequested: '2024-03-01T00:00:00Z',
    dateShipped: '2024-03-01T00:00:00Z',
    dateDelivered: '2024-03-01T00:00:00Z',
    lineItems: [
      {
        id: 'li-001',
        product: { id: 'prod-001', productCode: 'WK-2026', name: 'Wireless Keyboard' },
        quantityRequested: 200,
        quantityAllowed: 100,
      },
    ],
  }

  it('maps id and externalId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('sm-001')
    expect(result.externalId).toBe('sm-001')
  })

  it('maps number from identifier', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('SM-2024-001')
  })

  it('maps supplierId from origin.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-001')
  })

  it('maps destinationLocationId from destination.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('loc-001')
  })

  it('maps CREATED statusCode to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps RECEIVED statusCode to received', () => {
    const result = transformPurchaseOrder({ ...raw, statusCode: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps CANCELLED statusCode to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, statusCode: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps COMPLETED statusCode to closed', () => {
    const result = transformPurchaseOrder({ ...raw, statusCode: 'COMPLETED' })
    expect(result.status).toBe('closed')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-001')
    expect(result.lines[0]!.quantityOrdered).toBe(200)
    expect(result.lines[0]!.quantityReceived).toBe(100)
  })

  it('maps orderedAt from dateRequested', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from dateDelivered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to openboxes', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('openboxes')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
