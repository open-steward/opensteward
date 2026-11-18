import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type Kobo360TripResponse,
} from '../../../../../../../src/verticals/logistics/adapters/kobo360/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeTrip(o: Partial<Kobo360TripResponse> = {}): Kobo360TripResponse {
  return {
    id: 'trip-1',
    tracking_number: 'KBO-TRK-001',
    status: 'IN_TRANSIT',
    service_type: 'FTL',
    weight_kg: 1000,
    origin: {
      address1: '10 Origin Road',
      city: 'Lagos',
      country: 'NG',
    },
    destination: {
      address1: '20 Dest Road',
      city: 'Abuja',
      country: 'NG',
    },
    // Integer minor units — MoneySchema.amount requires .int()
    cost: 250000,
    currency: 'NGN',
    estimated_delivery_date: '2024-03-01T00:00:00Z',
    notes: 'Fragile cargo',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('kobo360 transformShipment', () => {
  it('maps id', () => {
    expect(transformShipment(makeTrip()).id).toBe('trip-1')
  })

  it('falls back to trip_id when id absent', () => {
    expect(transformShipment(makeTrip({ id: undefined, trip_id: 'trip-9' })).id).toBe('trip-9')
  })

  it('maps tracking_number', () => {
    expect(transformShipment(makeTrip()).trackingNumber).toBe('KBO-TRK-001')
  })

  it('falls back to reference when tracking_number absent', () => {
    expect(
      transformShipment(makeTrip({ tracking_number: undefined, reference: 'REF-42' }))
        .trackingNumber,
    ).toBe('REF-42')
  })

  it('always sets carrierId to kobo360', () => {
    expect(transformShipment(makeTrip()).carrierId).toBe('kobo360')
  })

  it('maps IN_TRANSIT status', () => {
    expect(transformShipment(makeTrip({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps PENDING status', () => {
    expect(transformShipment(makeTrip({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps DELIVERED status', () => {
    expect(transformShipment(makeTrip({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps FAILED to EXCEPTION', () => {
    expect(transformShipment(makeTrip({ status: 'FAILED' })).status).toBe('EXCEPTION')
  })

  it('maps CANCELLED status', () => {
    expect(transformShipment(makeTrip({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps service_type to serviceCode', () => {
    expect(transformShipment(makeTrip()).serviceCode).toBe('FTL')
  })

  it('maps weight_kg to totalWeight in kg', () => {
    const result = transformShipment(makeTrip())
    expect(result.totalWeight?.value).toBe(1000)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps origin to originAddress', () => {
    const result = transformShipment(makeTrip())
    expect(result.originAddress?.city).toBe('Lagos')
  })

  it('maps destination to destinationAddress', () => {
    const result = transformShipment(makeTrip())
    expect(result.destinationAddress?.city).toBe('Abuja')
  })

  it('maps cost + currency', () => {
    const result = transformShipment(makeTrip())
    expect(result.cost?.amount).toBe(250000)
    expect(result.cost?.currency).toBe('NGN')
  })

  it('cost is undefined when currency absent', () => {
    expect(transformShipment(makeTrip({ currency: undefined })).cost).toBeUndefined()
  })

  it('maps notes', () => {
    expect(transformShipment(makeTrip()).notes).toBe('Fragile cargo')
  })

  it('sets mode to ftl', () => {
    expect(transformShipment(makeTrip()).mode).toBe('ftl')
  })

  it('maps estimated_delivery_date to Date', () => {
    expect(transformShipment(makeTrip()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('attaches metadata', () => {
    const raw = makeTrip()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('validates against ShipmentSchema', () => {
    const result = transformShipment(makeTrip())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
