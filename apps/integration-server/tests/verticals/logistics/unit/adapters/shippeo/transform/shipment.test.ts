import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  extractShipments,
  type ShippeoShipmentResponse,
  type ShippeoShipmentsListResponse,
} from '../../../../../../../src/verticals/logistics/adapters/shippeo/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<ShippeoShipmentResponse> = {}): ShippeoShipmentResponse {
  return {
    id: 'shp-shippeo-001',
    reference: 'REF-001',
    external_reference: 'EXT-001',
    tracking_number: 'TRK-001',
    status: 'IN_TRANSIT',
    transport_mode: 'ROAD',
    carrier_code: 'DHL',
    service_code: 'EXPRESS',
    origin: {
      name: 'Origin Depot',
      street1: '1 Depot Road',
      city: 'Paris',
      state: null,
      postal_code: '75001',
      country: 'FR',
    },
    destination: {
      name: 'Customer',
      street1: '2 Customer St',
      city: 'Lyon',
      state: null,
      postal_code: '69001',
      country: 'FR',
    },
    estimated_delivery_at: '2024-03-04T00:00:00Z',
    actual_delivery_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment', () => {
  it('maps id', () => {
    expect(transformShipment(makeRaw()).id).toBe('shp-shippeo-001')
  })

  it('maps trackingNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRK-001')
  })

  it('maps carrierId from carrier_code', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('DHL')
  })

  it('defaults carrierId to shippeo when carrier_code absent', () => {
    expect(transformShipment(makeRaw({ carrier_code: null })).carrierId).toBe('shippeo')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('EXPRESS')
  })

  it('maps reference from reference field', () => {
    expect(transformShipment(makeRaw()).reference).toBe('REF-001')
  })

  it('falls back to external_reference when reference absent', () => {
    expect(transformShipment(makeRaw({ reference: null })).reference).toBe('EXT-001')
  })

  it('maps IN_TRANSIT status', () => {
    expect(transformShipment(makeRaw({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps PENDING for CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'CREATED' })).status).toBe('PENDING')
  })

  it('maps DELIVERED for DELIVERY_CONFIRMED', () => {
    expect(transformShipment(makeRaw({ status: 'DELIVERY_CONFIRMED' })).status).toBe('DELIVERED')
  })

  it('maps EXCEPTION for DELAYED', () => {
    expect(transformShipment(makeRaw({ status: 'DELAYED' })).status).toBe('EXCEPTION')
  })

  it('maps RETURNED for RETURN_TO_SENDER', () => {
    expect(transformShipment(makeRaw({ status: 'RETURN_TO_SENDER' })).status).toBe('RETURNED')
  })

  it('maps mode from transport_mode ROAD to ftl', () => {
    expect(transformShipment(makeRaw({ transport_mode: 'ROAD' })).mode).toBe('ftl')
  })

  it('maps mode from transport_mode AIR to air', () => {
    expect(transformShipment(makeRaw({ transport_mode: 'AIR' })).mode).toBe('air')
  })

  it('maps mode from transport_mode OCEAN to ocean', () => {
    expect(transformShipment(makeRaw({ transport_mode: 'OCEAN' })).mode).toBe('ocean')
  })

  it('maps mode from transport_mode PARCEL to parcel', () => {
    expect(transformShipment(makeRaw({ transport_mode: 'PARCEL' })).mode).toBe('parcel')
  })

  it('maps originAddress city', () => {
    expect(transformShipment(makeRaw()).originAddress?.city).toBe('Paris')
  })

  it('maps destinationAddress from destination', () => {
    expect(transformShipment(makeRaw()).destinationAddress?.city).toBe('Lyon')
  })

  it('maps estimatedDeliveryAt', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toEqual(
      new Date('2024-03-04T00:00:00Z'),
    )
  })

  it('maps createdAt', () => {
    expect(transformShipment(makeRaw()).createdAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('returns undefined for empty origin object', () => {
    const result = transformShipment(makeRaw({ origin: null }))
    expect(result.originAddress).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

describe('extractShipments', () => {
  it('extracts from data field', () => {
    const res: ShippeoShipmentsListResponse = { data: [makeRaw()] }
    expect(extractShipments(res)).toHaveLength(1)
  })

  it('extracts from results field', () => {
    const res: ShippeoShipmentsListResponse = { results: [makeRaw()] }
    expect(extractShipments(res)).toHaveLength(1)
  })

  it('extracts from items field', () => {
    const res: ShippeoShipmentsListResponse = { items: [makeRaw()] }
    expect(extractShipments(res)).toHaveLength(1)
  })

  it('returns empty array when no field present', () => {
    expect(extractShipments({})).toEqual([])
  })

  it('prefers data over results', () => {
    const res: ShippeoShipmentsListResponse = {
      data: [makeRaw({ id: 'data-one' })],
      results: [makeRaw({ id: 'results-one' })],
    }
    expect(extractShipments(res)[0].id).toBe('data-one')
  })
})
