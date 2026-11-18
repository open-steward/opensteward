import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawLightspeedConsignment,
} from '../../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('lightspeed-inventory transformPurchaseOrder', () => {
  const raw: RawLightspeedConsignment = {
    id: 'con-001',
    name: 'PO-2024-001',
    type: 'SUPPLIER',
    status: 'OPEN',
    supplier_id: 'sup-abc',
    outlet_id: 'outlet-xyz',
    due_at: '2024-03-01T00:00:00Z',
    sent_at: '2024-03-01T00:00:00Z',
    received_at: undefined,
    total_cost_gain: 150.5,
    products: [{ product_id: 'prod-1', count: 10, received: 0, cost: 5.99 }],
    version: 1,
  }

  it('maps id and externalId from id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('con-001')
    expect(result.externalId).toBe('con-001')
  })

  it('maps number from name field', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from supplier_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-abc')
  })

  it('maps destinationLocationId from outlet_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('outlet-xyz')
  })

  it('maps OPEN status to draft', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('draft')
  })

  it('maps SENT status to sent', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'SENT' })
    expect(result.status).toBe('sent')
  })

  it('maps RECEIVED status to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps CANCELLED status to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('maps lines from products array', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-1')
    expect(result.lines[0].quantityOrdered).toBe(10)
    expect(result.lines[0].quantityReceived).toBe(0)
  })

  it('maps expectedAt from due_at', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to lightspeed-inventory', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('lightspeed-inventory')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
