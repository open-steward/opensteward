import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/shipment'
import type { TrackPodOrder } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/order'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(overrides: Partial<TrackPodOrder> = {}): TrackPodOrder {
  return {
    Id: 'ord-001',
    Number: 'ORD-001',
    TrackId: 'TRK-001',
    Date: '2024-03-01T00:00:00Z',
    Status: 'in progress',
    ContactName: 'Alice Smith',
    Phone: '+15555555555',
    Email: 'alice@example.com',
    Address: '1 Main St, Springfield',
    Note: 'Leave at door',
    TimeSlotTo: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('track-pod transformShipment', () => {
  it('maps Id → id', () => {
    const r = transformShipment(makeOrder())
    expect(r.id).toBe('ord-001')
  })

  it('falls back to TrackId when Id absent', () => {
    const r = transformShipment(makeOrder({ Id: null }))
    expect(r.id).toBe('TRK-001')
  })

  it('maps TrackId → trackingNumber', () => {
    const r = transformShipment(makeOrder())
    expect(r.trackingNumber).toBe('TRK-001')
  })

  it('falls back to Number for trackingNumber when TrackId absent', () => {
    const r = transformShipment(makeOrder({ TrackId: null }))
    expect(r.trackingNumber).toBe('ORD-001')
  })

  it('hardcodes carrierId to track-pod', () => {
    const r = transformShipment(makeOrder())
    expect(r.carrierId).toBe('track-pod')
  })

  it('maps "in progress" → OUT_FOR_DELIVERY', () => {
    const r = transformShipment(makeOrder())
    expect(r.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps ContactName → destinationAddress.name', () => {
    const r = transformShipment(makeOrder())
    expect(r.destinationAddress?.name).toBe('Alice Smith')
  })

  it('maps Address → destinationAddress.street1', () => {
    const r = transformShipment(makeOrder())
    expect(r.destinationAddress?.street1).toBe('1 Main St, Springfield')
  })

  it('maps Note → notes', () => {
    const r = transformShipment(makeOrder())
    expect(r.notes).toBe('Leave at door')
  })

  it('maps Number → reference', () => {
    const r = transformShipment(makeOrder())
    expect(r.reference).toBe('ORD-001')
  })

  it('maps TimeSlotTo → estimatedDeliveryAt as Date', () => {
    const r = transformShipment(makeOrder())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(r.estimatedDeliveryAt?.toISOString()).toBe('2024-03-05T00:00:00.000Z')
  })

  it('maps Date → createdAt as Date', () => {
    const r = transformShipment(makeOrder())
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['collected', 'DELIVERED'],
      ['not delivered', 'EXCEPTION'],
      ['not collected', 'EXCEPTION'],
      ['rejected', 'EXCEPTION'],
      ['partially', 'OUT_FOR_DELIVERY'],
      ['in progress', 'OUT_FOR_DELIVERY'],
      ['active', 'OUT_FOR_DELIVERY'],
      ['unscheduled', 'PENDING'],
      ['pending', 'PENDING'],
      ['scheduled', 'LABEL_CREATED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['bogus', 'IN_TRANSIT'],
    ]
    for (const [s, expected] of cases) {
      expect(transformShipment(makeOrder({ Status: s })).status, `status: ${s}`).toBe(expected)
    }
  })

  it('metadata references the raw object', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('handles null optional fields gracefully', () => {
    const r = transformShipment(
      makeOrder({
        Note: null,
        Date: null,
        TimeSlotTo: null,
        ContactName: null,
        Address: null,
        TrackId: null,
      }),
    )
    expect(r.notes).toBeUndefined()
    expect(r.createdAt).toBeUndefined()
    expect(r.estimatedDeliveryAt).toBeUndefined()
    expect(() => ShipmentSchema.parse(r)).not.toThrow()
  })
})
