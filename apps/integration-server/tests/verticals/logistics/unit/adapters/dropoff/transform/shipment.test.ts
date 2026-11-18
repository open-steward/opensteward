import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/shipment'
import type { DropoffOrder } from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/tracking'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOrder(o: Partial<DropoffOrder> = {}): DropoffOrder {
  return {
    order_id: 'do-ship-001',
    order_status_code: 'in_transit',
    tracking_number: 'TRK-SHIP-001',
    pickup_address: {
      name: 'Sender',
      street1: '1 Sender St',
      city: 'Austin',
      state: 'TX',
      country: 'US',
    },
    dropoff_address: {
      name: 'Receiver',
      street1: '2 Receiver Rd',
      city: 'Dallas',
      state: 'TX',
      country: 'US',
    },
    delivery_instructions: 'Ring bell',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T12:00:00Z',
    ...o,
  }
}

describe('dropoff transformShipment', () => {
  it('maps order_id to id', () => {
    expect(transformShipment(makeOrder()).id).toBe('do-ship-001')
  })

  it('in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeOrder()).status).toBe('IN_TRANSIT')
  })

  it('pending → PENDING', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'pending' })).status).toBe('PENDING')
  })

  it('assigned → LABEL_CREATED', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'assigned' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('out_for_delivery → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('delivered → DELIVERED', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('cancelled → CANCELLED', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('unknown status → UNKNOWN', () => {
    expect(transformShipment(makeOrder({ order_status_code: 'bogus' })).status).toBe('UNKNOWN')
  })

  it('maps trackingNumber', () => {
    expect(transformShipment(makeOrder()).trackingNumber).toBe('TRK-SHIP-001')
  })

  it('falls back to order_id when tracking_number absent', () => {
    expect(transformShipment(makeOrder({ tracking_number: null })).trackingNumber).toBe(
      'do-ship-001',
    )
  })

  it('carrierId is dropoff', () => {
    expect(transformShipment(makeOrder()).carrierId).toBe('dropoff')
  })

  it('mode is parcel', () => {
    expect(transformShipment(makeOrder()).mode).toBe('parcel')
  })

  it('maps originAddress', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.name).toBe('Sender')
    expect(result.originAddress?.city).toBe('Austin')
  })

  it('maps destinationAddress', () => {
    const result = transformShipment(makeOrder())
    expect(result.destinationAddress?.name).toBe('Receiver')
    expect(result.destinationAddress?.city).toBe('Dallas')
  })

  it('maps delivery_instructions to notes', () => {
    expect(transformShipment(makeOrder()).notes).toBe('Ring bell')
  })

  it('parses createdAt as Date', () => {
    expect(transformShipment(makeOrder()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeOrder())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw order', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
