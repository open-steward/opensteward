import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GoCometContainer,
} from '../../../../../../../src/verticals/logistics/adapters/gocomet/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeContainer(overrides: Partial<GoCometContainer> = {}): GoCometContainer {
  return {
    id: 'ctr-001',
    container_number: 'MSCU1234567',
    booking_number: 'BK-2024-001',
    bill_of_lading: 'BL-2024-001',
    status: 'IN_TRANSIT',
    vessel_name: 'MV Ocean Star',
    voyage_number: 'V042E',
    shipping_line: 'MSC',
    container_type: '40HC',
    seal_number: 'SL-998877',
    origin_port: { un_locode: 'CNSHA', name: 'Shanghai' },
    destination_port: { un_locode: 'USLAX', name: 'Los Angeles' },
    origin_address: { city: 'Shanghai', country: 'CN' },
    destination_address: { city: 'Los Angeles', country: 'US' },
    weight: 24000,
    weight_unit: 'kg',
    eta: '2024-03-15T00:00:00Z',
    etd: '2024-03-01T00:00:00Z',
    actual_arrival: null,
    actual_departure: null,
    reference: 'REF-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('GoComet transformShipment', () => {
  it('maps id from container id', () => {
    expect(transformShipment(makeContainer()).id).toBe('ctr-001')
  })

  it('falls back to container_number when id is missing', () => {
    expect(transformShipment(makeContainer({ id: null })).id).toBe('MSCU1234567')
  })

  it('sets carrierId to gocomet', () => {
    expect(transformShipment(makeContainer()).carrierId).toBe('gocomet')
  })

  it('maps trackingNumber from container_number', () => {
    expect(transformShipment(makeContainer()).trackingNumber).toBe('MSCU1234567')
  })

  it('maps IN_TRANSIT status → IN_TRANSIT', () => {
    expect(transformShipment(makeContainer({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status → DELIVERED', () => {
    expect(transformShipment(makeContainer({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps CANCEL status → CANCELLED', () => {
    expect(transformShipment(makeContainer({ status: 'CANCEL' })).status).toBe('CANCELLED')
  })

  it('maps BOOKING status → LABEL_CREATED', () => {
    expect(transformShipment(makeContainer({ status: 'BOOKING' })).status).toBe('LABEL_CREATED')
  })

  it('maps EXCEPTION status → EXCEPTION', () => {
    expect(transformShipment(makeContainer({ status: 'EXCEPTION' })).status).toBe('EXCEPTION')
  })

  it('maps SAILING status → IN_TRANSIT', () => {
    expect(transformShipment(makeContainer({ status: 'SAILING' })).status).toBe('IN_TRANSIT')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeContainer({ status: 'MYSTERY' })).status).toBe('UNKNOWN')
  })

  it('sets mode to ocean', () => {
    expect(transformShipment(makeContainer()).mode).toBe('ocean')
  })

  it('maps ocean.containerNumber', () => {
    expect(transformShipment(makeContainer()).ocean?.containerNumber).toBe('MSCU1234567')
  })

  it('maps ocean.containerType', () => {
    expect(transformShipment(makeContainer()).ocean?.containerType).toBe('40HC')
  })

  it('maps ocean.bookingNumber', () => {
    expect(transformShipment(makeContainer()).ocean?.bookingNumber).toBe('BK-2024-001')
  })

  it('maps ocean.billOfLadingNumber from bill_of_lading', () => {
    expect(transformShipment(makeContainer()).ocean?.billOfLadingNumber).toBe('BL-2024-001')
  })

  it('maps ocean.vesselName', () => {
    expect(transformShipment(makeContainer()).ocean?.vesselName).toBe('MV Ocean Star')
  })

  it('maps ocean.voyageNumber', () => {
    expect(transformShipment(makeContainer()).ocean?.voyageNumber).toBe('V042E')
  })

  it('maps ocean.portOfLoading from origin_port un_locode', () => {
    expect(transformShipment(makeContainer()).ocean?.portOfLoading).toBe('CNSHA')
  })

  it('maps ocean.portOfDischarge from destination_port un_locode', () => {
    expect(transformShipment(makeContainer()).ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps ocean.estimatedArrival from eta', () => {
    expect(transformShipment(makeContainer()).ocean?.estimatedArrival).toBeInstanceOf(Date)
  })

  it('maps ocean.estimatedDeparture from etd', () => {
    expect(transformShipment(makeContainer()).ocean?.estimatedDeparture).toBeInstanceOf(Date)
  })

  it('maps totalWeight from weight and weight_unit', () => {
    const result = transformShipment(makeContainer())
    expect(result.totalWeight?.value).toBe(24000)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('omits totalWeight when weight is null', () => {
    expect(transformShipment(makeContainer({ weight: null })).totalWeight).toBeUndefined()
  })

  it('maps reference from bill_of_lading first', () => {
    expect(transformShipment(makeContainer()).reference).toBe('BL-2024-001')
  })

  it('falls back to booking_number for reference when bill_of_lading is missing', () => {
    const result = transformShipment(makeContainer({ bill_of_lading: null }))
    expect(result.reference).toBe('BK-2024-001')
  })

  it('maps estimatedDeliveryAt from eta', () => {
    expect(transformShipment(makeContainer()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from created_at', () => {
    expect(transformShipment(makeContainer()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updated_at', () => {
    expect(transformShipment(makeContainer()).updatedAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    const result = transformShipment(makeContainer())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
