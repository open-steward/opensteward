import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShiptheoryShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shiptheory/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<ShiptheoryShipment> = {}): ShiptheoryShipment {
  return {
    channel_reference_id: 'ORD-001',
    channel_reference_id_3: 'Note for driver',
    status: 'in transit',
    tracking_number: 'TRK999',
    carrier: 'royal-mail',
    service_name: 'RM_TRACKED_24',
    weight: 1.5,
    value: 25.0,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T10:00:00Z',
    sender: {
      firstname: 'Alice',
      lastname: 'Smith',
      address_line_1: '1 Sender St',
      city: 'Manchester',
      country: 'GB',
      postcode: 'M1 1AA',
    },
    recipient: {
      firstname: 'Bob',
      lastname: 'Jones',
      address_line_1: '2 Recipient Rd',
      city: 'Birmingham',
      country: 'GB',
      postcode: 'B1 1BB',
    },
    ...overrides,
  }
}

describe('Shiptheory transformShipment', () => {
  it('maps channel_reference_id to id and reference', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('ORD-001')
    expect(result.reference).toBe('ORD-001')
  })

  it('maps "in transit" status to IN_TRANSIT', () => {
    const result = transformShipment(makeShipment())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps tracking_number and carrier', () => {
    const result = transformShipment(makeShipment())
    expect(result.trackingNumber).toBe('TRK999')
    expect(result.carrierId).toBe('royal-mail')
  })

  it('maps weight to totalWeight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps value to cost with GBP currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(25)
    expect(result.cost?.currency).toBe('GBP')
  })

  it('maps sender to originAddress and recipient to destinationAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Manchester')
    expect(result.destinationAddress?.city).toBe('Birmingham')
  })

  it('maps channel_reference_id_3 to notes', () => {
    const result = transformShipment(makeShipment())
    expect(result.notes).toBe('Note for driver')
  })

  it('maps createdAt and updatedAt as Date objects', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps all status values correctly', () => {
    const cases: Array<[string | null, string]> = [
      ['pending', 'PENDING'],
      ['label created', 'LABEL_CREATED'],
      ['label_created', 'LABEL_CREATED'],
      ['in transit', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['out for delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['failed', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      [null, 'UNKNOWN'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })

  it('handles null addresses gracefully', () => {
    const result = transformShipment(makeShipment({ sender: null, recipient: null }))
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('handles null weight and value', () => {
    const result = transformShipment(makeShipment({ weight: null, value: null }))
    expect(result.totalWeight).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })
})
