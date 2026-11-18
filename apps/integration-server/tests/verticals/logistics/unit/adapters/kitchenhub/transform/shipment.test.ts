import { describe, it, expect } from 'vitest'
import { transformDelivery } from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { documentedDelivery } from '../fixtures/documented'

describe('kitchenhub transformDelivery (DeliveryResponseSerializer)', () => {
  it('parses with ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformDelivery(documentedDelivery()))).not.toThrow()
  })

  it('maps delivery_id, delivery_order_id, store_id and order_id', () => {
    const s = ShipmentSchema.parse(transformDelivery(documentedDelivery()))
    expect(s.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(s.trackingNumber).toBe('dsd-abc123')
    expect(s.warehouseId).toBe('your-store-id')
    expect(s.reference).toBe('order-123')
  })

  it('maps drop_off_notes and created_at', () => {
    const s = transformDelivery(documentedDelivery())
    expect(s.notes).toBe('Leave at door')
    expect(s.createdAt?.toISOString()).toBe('2025-05-05T13:55:00.000Z')
  })

  it('maps delivery_at to actualDeliveryAt', () => {
    const s = transformDelivery({
      ...documentedDelivery(),
      status: 'delivered',
      delivery_at: '2025-05-05T14:40:00Z',
    })
    expect(s.actualDeliveryAt?.toISOString()).toBe('2025-05-05T14:40:00.000Z')
  })

  it('maps no cost (charges carry no currency), no carrier and no label URL', () => {
    const s = transformDelivery(documentedDelivery())
    expect(s.cost).toBeUndefined()
    expect(s.carrierId).toBeUndefined()
    expect(s.labelUrl).toBeUndefined()
  })

  it.each([
    ['new', 'PENDING'],
    ['placed', 'PENDING'],
    ['arrived', 'PENDING'],
    ['enroute', 'OUT_FOR_DELIVERY'],
    ['delivered', 'DELIVERED'],
    ['cancelled', 'CANCELLED'],
    ['returned', 'RETURNED'],
    ['something_else', 'UNKNOWN'],
  ])('maps status %s to %s', (status, expected) => {
    const s = ShipmentSchema.parse(transformDelivery({ ...documentedDelivery(), status }))
    expect(s.status).toBe(expected)
  })
})
