import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  transformShipmentFromBooking,
  type WarpShipmentResponse,
  type WarpBookingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/warp/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipmentRaw(overrides: Partial<WarpShipmentResponse> = {}): WarpShipmentResponse {
  return {
    shipment_id: 'shp-warp-001',
    shipment_number: 'SHP-2024-001',
    tracking_number: 'TRK-2024-001',
    order_number: 'ORD-2024-001',
    mode: 'ltl',
    status: 'inRouteToDelivery',
    origin_zip: '90210',
    destination_zip: '10001',
    pickup_date: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-05T00:00:00Z',
    price_usd: 199.5,
    booked_at: '2024-03-01T00:00:00Z',
    cancelled_at: null,
    pickup_address: {
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
      street: '123 Pickup St',
    },
    delivery_address: {
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      street: '456 Delivery Ave',
    },
    tracking_dashboard: 'https://customer.wearewarp.com/track/TRK-2024-001',
    ...overrides,
  }
}

function makeBookingRaw(overrides: Partial<WarpBookingResponse> = {}): WarpBookingResponse {
  return {
    booked: true,
    shipment_id: 'shp-warp-booking-001',
    shipment_number: 'SHP-BK-001',
    order_id: 'ord-warp-001',
    order_number: 'ORD-BK-001',
    tracking_number: 'TRK-BK-001',
    tracking_dashboard: 'https://customer.wearewarp.com/track/TRK-BK-001',
    ...overrides,
  }
}

describe('transformShipment (warp)', () => {
  it('maps id from shipment_id', () => {
    expect(transformShipment(makeShipmentRaw()).id).toBe('shp-warp-001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipment(makeShipmentRaw()).trackingNumber).toBe('TRK-2024-001')
  })

  it('falls back trackingNumber to shipment_number when tracking_number absent', () => {
    const result = transformShipment(makeShipmentRaw({ tracking_number: undefined }))
    expect(result.trackingNumber).toBe('SHP-2024-001')
  })

  it('sets carrierId to warp', () => {
    expect(transformShipment(makeShipmentRaw()).carrierId).toBe('warp')
  })

  it('maps status inRouteToDelivery → IN_TRANSIT', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'inRouteToDelivery' })).status).toBe(
      'IN_TRANSIT',
    )
  })

  it('maps status booked → LABEL_CREATED', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'booked' })).status).toBe('LABEL_CREATED')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status exception → EXCEPTION', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipmentRaw({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps mode ltl → ltl', () => {
    expect(transformShipment(makeShipmentRaw()).mode).toBe('ltl')
  })

  it('maps mode ftl → ftl', () => {
    expect(transformShipment(makeShipmentRaw({ mode: 'ftl' })).mode).toBe('ftl')
  })

  it('maps mode van → ftl', () => {
    expect(transformShipment(makeShipmentRaw({ mode: 'van' })).mode).toBe('ftl')
  })

  it('maps originAddress from pickup_address', () => {
    const result = transformShipment(makeShipmentRaw())
    expect(result.originAddress?.city).toBe('Los Angeles')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destinationAddress from delivery_address', () => {
    const result = transformShipment(makeShipmentRaw())
    expect(result.destinationAddress?.city).toBe('New York')
    expect(result.destinationAddress?.postalCode).toBe('10001')
  })

  it('falls back originAddress to origin_zip alone', () => {
    const result = transformShipment(makeShipmentRaw({ pickup_address: undefined }))
    expect(result.originAddress?.postalCode).toBe('90210')
    expect(result.originAddress?.country).toBe('US')
  })

  it('converts price_usd to minor units in cost.amount', () => {
    // $199.50 → 19950 cents
    expect(transformShipment(makeShipmentRaw()).cost?.amount).toBe(19950)
    expect(transformShipment(makeShipmentRaw()).cost?.currency).toBe('USD')
  })

  it('omits cost when price_usd is absent', () => {
    expect(transformShipment(makeShipmentRaw({ price_usd: undefined })).cost).toBeUndefined()
  })

  it('maps reference from order_number', () => {
    expect(transformShipment(makeShipmentRaw()).reference).toBe('ORD-2024-001')
  })

  it('maps labelUrl from tracking_dashboard', () => {
    expect(transformShipment(makeShipmentRaw()).labelUrl).toContain('TRK-2024-001')
  })

  it('maps estimatedDeliveryAt from delivery_date', () => {
    expect(transformShipment(makeShipmentRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from booked_at', () => {
    expect(transformShipment(makeShipmentRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeShipmentRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipmentRaw()))).not.toThrow()
  })
})

describe('transformShipmentFromBooking (warp)', () => {
  it('maps id from shipment_id', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).id).toBe('shp-warp-booking-001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).trackingNumber).toBe('TRK-BK-001')
  })

  it('falls back trackingNumber to shipment_number', () => {
    const result = transformShipmentFromBooking(makeBookingRaw({ tracking_number: undefined }))
    expect(result.trackingNumber).toBe('SHP-BK-001')
  })

  it('sets status to LABEL_CREATED', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).status).toBe('LABEL_CREATED')
  })

  it('sets carrierId to warp', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).carrierId).toBe('warp')
  })

  it('maps reference from order_number', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).reference).toBe('ORD-BK-001')
  })

  it('maps labelUrl from tracking_dashboard', () => {
    expect(transformShipmentFromBooking(makeBookingRaw()).labelUrl).toContain('TRK-BK-001')
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipmentFromBooking(makeBookingRaw()))).not.toThrow()
  })
})
