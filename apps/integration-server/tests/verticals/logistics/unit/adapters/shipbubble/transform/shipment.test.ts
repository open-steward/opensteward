import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShipbubbleShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<ShipbubbleShipment> = {}): ShipbubbleShipment {
  return {
    order_id: 'SB-ORD-001',
    status: 'in_transit',
    courier: {
      name: 'GIG Logistics',
      email: 'support@gigl.ng',
      phone: '+2348012345678',
      tracking_code: 'GIGL1234567890',
      tracking_message: 'Package in transit',
    },
    ship_from: {
      name: 'Acme Lagos',
      phone: '+2349012345678',
      email: 'sender@acme.example',
      address: '14 Marina Street, Lagos',
    },
    ship_to: {
      name: 'Jane Doe',
      phone: '+2348098765432',
      email: null,
      address: '5 Allen Avenue, Ikeja',
    },
    waybill_document: undefined,
    date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (shipbubble)', () => {
  it('maps id from order_id', () => {
    expect(transformShipment(makeShipment()).id).toBe('SB-ORD-001')
  })

  it('maps status: in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps trackingNumber from courier.tracking_code', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('GIGL1234567890')
  })

  it('maps carrierId from courier.name', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('GIG Logistics')
  })

  it('maps originAddress fields from ship_from', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Acme Lagos')
    expect(result.originAddress?.street1).toBe('14 Marina Street, Lagos')
  })

  it('maps destinationAddress fields from ship_to', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.street1).toBe('5 Allen Avenue, Ikeja')
  })

  it('maps createdAt as Date from date field', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null | undefined, string][] = [
      ['pending', 'PENDING'],
      ['confirmed', 'LABEL_CREATED'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['unknown_value', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })

  it('handles missing courier gracefully', () => {
    const result = transformShipment(makeShipment({ courier: null }))
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrierId).toBeUndefined()
  })

  it('handles missing ship_from and ship_to gracefully', () => {
    const result = transformShipment(makeShipment({ ship_from: null, ship_to: null }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
