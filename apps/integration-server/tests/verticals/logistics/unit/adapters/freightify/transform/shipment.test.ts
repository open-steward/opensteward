import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type FreightifyShipment,
} from '../../../../../../../src/verticals/logistics/adapters/freightify/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<FreightifyShipment> = {}): FreightifyShipment {
  return {
    id: 'shp-001',
    booking_number: 'BK-1042',
    bill_of_lading: 'BL-1042',
    container_number: 'MSCU1234567',
    container_type: '40HC',
    status: 'in_transit',
    mode: 'FCL',
    carrier_name: 'Maersk',
    carrier_scac: 'MAEU',
    service_code: 'FCL-STANDARD',
    vessel_name: 'MV Test Star',
    voyage_number: 'V042E',
    port_of_loading: 'CNSHA',
    port_of_discharge: 'USLAX',
    estimated_departure: '2024-03-01T00:00:00Z',
    estimated_arrival: '2024-03-20T00:00:00Z',
    actual_departure: '2024-03-01T06:00:00Z',
    actual_arrival: null,
    freight_amount: 4500,
    currency: 'USD',
    reference: 'REF-001',
    notes: 'Fragile cargo',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('freightify transformShipment', () => {
  it('maps id correctly', () => {
    expect(transformShipment(makeShipment()).id).toBe('shp-001')
  })

  it('maps in_transit status', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps pending status', () => {
    expect(transformShipment(makeShipment({ status: 'pending' })).status).toBe('PENDING')
  })

  it('maps booked status to LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'booked' })).status).toBe('LABEL_CREATED')
  })

  it('maps delivered status', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps cancelled status', () => {
    expect(transformShipment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'something_else' })).status).toBe('UNKNOWN')
  })

  it('maps mode FCL → ocean', () => {
    expect(transformShipment(makeShipment()).mode).toBe('ocean')
  })

  it('maps mode air → air', () => {
    expect(transformShipment(makeShipment({ mode: 'air' })).mode).toBe('air')
  })

  it('uses container_number as trackingNumber when present', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('MSCU1234567')
  })

  it('falls back to booking_number as trackingNumber when container_number missing', () => {
    expect(transformShipment(makeShipment({ container_number: null })).trackingNumber).toBe(
      'BK-1042',
    )
  })

  it('maps carrierId from carrier_scac', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('MAEU')
  })

  it('falls back carrierId to carrier_name when scac missing', () => {
    expect(transformShipment(makeShipment({ carrier_scac: null })).carrierId).toBe('Maersk')
  })

  it('maps ocean-specific fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.ocean?.containerNumber).toBe('MSCU1234567')
    expect(result.ocean?.bookingNumber).toBe('BK-1042')
    expect(result.ocean?.vesselName).toBe('MV Test Star')
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps freight cost', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(4500)
    expect(result.cost?.currency).toBe('USD')
  })

  it('omits cost when freight_amount is null', () => {
    expect(transformShipment(makeShipment({ freight_amount: null })).cost).toBeUndefined()
  })

  it('maps reference and notes', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('BK-1042') // booking_number takes precedence
    expect(result.notes).toBe('Fragile cargo')
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
