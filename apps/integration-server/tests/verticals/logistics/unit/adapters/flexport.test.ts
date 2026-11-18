import { describe, it, expect } from 'vitest'
import { transformRate, type FlexportRateDetail } from '../../../../../src/verticals/logistics/adapters/flexport/transform/rate'
import { transformTrackingEvents, type FlexportLegsResponse, type FlexportShipmentLeg } from '../../../../../src/verticals/logistics/adapters/flexport/transform/tracking'
import { transformShipment, type FlexportShipmentResponse } from '../../../../../src/verticals/logistics/adapters/flexport/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateDetail(overrides: Partial<FlexportRateDetail> = {}): FlexportRateDetail {
  return {
    id: 'rate-001',
    carrier_name: 'Maersk',
    service_type: 'ocean_fcl',
    amount: 2500.00,
    currency: 'USD',
    transit_days: 28,
    estimated_arrival_date: '2024-02-15T00:00:00Z',
    ...overrides,
  }
}

function makeShipmentLeg(overrides: Partial<FlexportShipmentLeg> = {}): FlexportShipmentLeg {
  return {
    id: 'leg-001',
    status: 'in_transit',
    carrier_name: 'Maersk',
    origin: {
      name: 'Shanghai Port',
      address: {
        city: 'Shanghai',
        country_code: 'CN',
      },
    },
    destination: {
      name: 'Los Angeles Port',
      address: {
        city: 'Los Angeles',
        state: 'CA',
        country_code: 'US',
      },
    },
    actual_departure_date: '2024-01-16T10:00:00Z',
    estimated_arrival_date: '2024-02-10T00:00:00Z',
    ...overrides,
  }
}

function makeLegsResponse(overrides: Partial<FlexportLegsResponse> = {}): FlexportLegsResponse {
  return {
    data: [makeShipmentLeg()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<FlexportShipmentResponse> = {}): FlexportShipmentResponse {
  return {
    id: 'shp-12345',
    status: 'in_transit',
    name: 'Shanghai to LA FCL',
    freight_type: 'ocean',
    transportation_mode: 'ocean_fcl',
    cargo_ready_date: '2024-01-10T00:00:00Z',
    created_at: '2024-01-05T10:00:00Z',
    updated_at: '2024-01-16T14:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateDetail()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('flexport')
    expect(result.serviceCode).toBe('ocean_fcl')
    expect(result.serviceName).toBe('Maersk')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2500.00)
    expect(result.transitDays).toBe(28)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateDetail()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing transit_days', () => {
    const raw = makeRateDetail({ transit_days: undefined })
    expect(transformRate(raw).transitDays).toBeUndefined()
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per leg', () => {
    const raw = makeLegsResponse()
    expect(transformTrackingEvents('shp-001', raw)).toHaveLength(1)
  })

  it('maps leg fields to canonical event', () => {
    const raw = makeLegsResponse()
    const event = transformTrackingEvents('shp-001', raw)[0]

    expect(event.shipmentId).toBe('shp-001')
    expect(event.carrierId).toBe('flexport')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.location?.city).toBe('Los Angeles')
    expect(event.location?.state).toBe('CA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    const raw = makeLegsResponse()
    transformTrackingEvents('shp-001', raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when data is empty', () => {
    const raw = makeLegsResponse({ data: [] })
    const events = transformTrackingEvents('shp-001', raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps booked to PRE_TRANSIT', () => {
    const raw = makeLegsResponse({ data: [makeShipmentLeg({ status: 'booked' })] })
    expect(transformTrackingEvents('shp-001', raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps confirmed to PRE_TRANSIT', () => {
    const raw = makeLegsResponse({ data: [makeShipmentLeg({ status: 'confirmed' })] })
    expect(transformTrackingEvents('shp-001', raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps arrived to IN_TRANSIT', () => {
    const raw = makeLegsResponse({ data: [makeShipmentLeg({ status: 'arrived' })] })
    expect(transformTrackingEvents('shp-001', raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps delivered to DELIVERED', () => {
    const raw = makeLegsResponse({ data: [makeShipmentLeg({ status: 'delivered' })] })
    expect(transformTrackingEvents('shp-001', raw)[0].status).toBe('DELIVERED')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeLegsResponse({ data: [makeShipmentLeg({ status: 'zz_unknown' })] })
    expect(transformTrackingEvents('shp-001', raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-12345')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.carrierId).toBe('flexport')
    expect(result.serviceCode).toBe('ocean_fcl')
    expect(result.reference).toBe('Shanghai to LA FCL')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps booked to PENDING', () => {
    const raw = makeShipmentResponse({ status: 'booked' })
    expect(transformShipment(raw).status).toBe('PENDING')
  })

  it('maps delivered to DELIVERED', () => {
    const raw = makeShipmentResponse({ status: 'delivered' })
    expect(transformShipment(raw).status).toBe('DELIVERED')
  })

  it('maps cancelled to CANCELLED', () => {
    const raw = makeShipmentResponse({ status: 'cancelled' })
    expect(transformShipment(raw).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipmentResponse({ status: 'zz_unknown' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })
})
