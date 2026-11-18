import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawBooqableOrder,
} from '../../../../../../../src/verticals/inventory/adapters/booqable/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('booqable transformPurchaseOrder', () => {
  const raw: RawBooqableOrder = {
    id: 'order-001',
    type: 'orders',
    attributes: {
      id: 'order-001',
      number: 1042,
      status: 'reserved',
      fulfillment_type: 'pickup',
      starts_at: '2024-03-01T00:00:00Z',
      stops_at: '2024-03-01T00:00:00Z',
      location_id: 'loc-001',
      customer_id: 'cust-001',
      grand_total_in_cents: 10000,
      deposit_in_cents: 2000,
      price_in_cents: 8000,
      payment_status: 'paid',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and externalId from resource id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('order-001')
    expect(result.externalId).toBe('order-001')
  })

  it('maps number from attributes.number as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('1042')
  })

  it('maps supplierId from customer_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('cust-001')
  })

  it('maps destinationLocationId from location_id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('loc-001')
  })

  it('maps reserved status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps concept status to draft', () => {
    const result = transformPurchaseOrder({
      ...raw,
      attributes: { ...raw.attributes, status: 'concept' },
    })
    expect(result.status).toBe('draft')
  })

  it('maps canceled status to cancelled', () => {
    const result = transformPurchaseOrder({
      ...raw,
      attributes: { ...raw.attributes, status: 'canceled' },
    })
    expect(result.status).toBe('cancelled')
  })

  it('maps stopped status to received', () => {
    const result = transformPurchaseOrder({
      ...raw,
      attributes: { ...raw.attributes, status: 'stopped' },
    })
    expect(result.status).toBe('received')
  })

  it('maps totalAmount from grand_total_in_cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(10000)
  })

  it('maps subtotalAmount from price_in_cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(8000)
  })

  it('sets platform to booqable', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('booqable')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
