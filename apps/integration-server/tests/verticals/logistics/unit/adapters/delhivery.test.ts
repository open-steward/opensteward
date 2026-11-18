import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DelhiveryTrackingResponse,
  type DelhiveryTrackingScan,
} from '../../../../../src/verticals/logistics/adapters/delhivery/transform/tracking'
import {
  transformShipment,
  type DelhiveryShipment,
} from '../../../../../src/verticals/logistics/adapters/delhivery/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingScan(overrides: Partial<DelhiveryTrackingScan> = {}): DelhiveryTrackingScan {
  return {
    status: 'In Transit',
    status_description: 'Package in transit to hub',
    scan_date_time: '2024-12-01T10:00:00Z',
    city: 'Bangalore',
    center: 'BLR-HUB',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<DelhiveryTrackingResponse> = {}): DelhiveryTrackingResponse {
  return {
    waybill: 'DL123456789',
    status: 'In Transit',
    scans: [
      makeTrackingScan({ status: 'Manifested', status_description: 'Shipment manifested', city: 'Hyderabad' }),
      makeTrackingScan(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<DelhiveryShipment> = {}): DelhiveryShipment {
  return {
    waybill: 'DL123456789',
    status: 'Manifested',
    service_code: 'EXPRESS',
    label_url: 'https://track.delhivery.com/labels/DL123456789.pdf',
    weight: 1.5,
    weight_unit: 'kg',
    sender: {
      name: 'Amit Sharma',
      address_line1: '100 HSR Layout',
      city: 'Bangalore',
      state: 'Karnataka',
      postal_code: '560102',
      country: 'IN',
    },
    recipient: {
      name: 'Deepa Nair',
      address_line1: '200 Banjara Hills',
      city: 'Hyderabad',
      state: 'Telangana',
      postal_code: '500034',
      country: 'IN',
    },
    reference: 'IN-ORD-002',
    created_at: '2024-12-01T08:00:00Z',
    updated_at: '2024-12-01T10:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per scan', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps scan fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('DL123456789')
    expect(event.carrierId).toBe('delhivery')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment manifested')
    expect(event.location?.city).toBe('Hyderabad')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when scans is empty', () => {
    const events = transformTracking(makeTrackingResponse({ scans: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null city gracefully', () => {
    const raw = makeTrackingResponse({ scans: [makeTrackingScan({ city: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['Manifested', 'PRE_TRANSIT'],
      ['In Transit', 'IN_TRANSIT'],
      ['Dispatched', 'IN_TRANSIT'],
      ['Out for delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Undelivered', 'FAILURE'],
      ['RTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({ scans: [makeTrackingScan({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())

    expect(result.id).toBe('DL123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('DL123456789')
    expect(result.carrierId).toBe('delhivery')
    expect(result.serviceCode).toBe('EXPRESS')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Amit Sharma')
    expect(result.destinationAddress?.name).toBe('Deepa Nair')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null, weight_unit: null, label_url: null, sender: null,
      recipient: null, service_code: null, status: null,
      reference: null, created_at: null, updated_at: null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['Manifested', 'PENDING'],
      ['In Transit', 'IN_TRANSIT'],
      ['Dispatched', 'IN_TRANSIT'],
      ['Out for delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Undelivered', 'EXCEPTION'],
      ['RTO', 'RETURNED'],
      ['Cancelled', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
