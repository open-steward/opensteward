import { describe, it, expect } from 'vitest'
import { transformShipmentToTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/tracking'
import type { ShiptheoryShipment } from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeShipment(overrides: Partial<ShiptheoryShipment> = {}): ShiptheoryShipment {
  return {
    channel_reference_id: 'ORD-001',
    tracking_number: 'TRK999',
    carrier: 'dpd',
    status: 'in transit',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('Shiptheory transformShipmentToTrackingEvents', () => {
  it('always returns exactly one event', () => {
    const events = transformShipmentToTrackingEvents(makeShipment())
    expect(events).toHaveLength(1)
  })

  it('maps shipmentId from channel_reference_id and carrierId from carrier', () => {
    const event = transformShipmentToTrackingEvents(makeShipment())[0]
    expect(event.shipmentId).toBe('ORD-001')
    expect(event.carrierId).toBe('dpd')
  })

  it('maps tracking_number to trackingNumber', () => {
    const event = transformShipmentToTrackingEvents(makeShipment())[0]
    expect(event.trackingNumber).toBe('TRK999')
  })

  it('maps "in transit" to IN_TRANSIT status', () => {
    const event = transformShipmentToTrackingEvents(makeShipment())[0]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps updated_at to occurredAt', () => {
    const event = transformShipmentToTrackingEvents(makeShipment())[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-01T10:00:00.000Z')
  })

  it('passes TrackingEventSchema validation', () => {
    const event = transformShipmentToTrackingEvents(makeShipment())[0]
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })

  it('maps all tracking statuses correctly', () => {
    const cases: Array<[string | null, string]> = [
      ['pending', 'PRE_TRANSIT'],
      ['label created', 'PRE_TRANSIT'],
      ['in transit', 'IN_TRANSIT'],
      ['dispatched', 'IN_TRANSIT'],
      ['out for delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available for pickup', 'AVAILABLE_FOR_PICKUP'],
      ['return to sender', 'RETURN_TO_SENDER'],
      ['failed', 'FAILURE'],
      ['exception', 'FAILURE'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipmentToTrackingEvents(makeShipment({ status }))[0].status).toBe(expected)
    }
  })

  it('falls back to created_at for occurredAt when updated_at is null', () => {
    const event = transformShipmentToTrackingEvents(
      makeShipment({ updated_at: null, created_at: '2024-03-01T00:00:00Z' }),
    )[0]
    expect(event.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('attaches raw shipment as metadata', () => {
    const raw = makeShipment()
    expect(transformShipmentToTrackingEvents(raw)[0].metadata).toBe(raw)
  })
})
