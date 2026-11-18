import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ParcelHubShipment,
} from '../../../../../src/verticals/logistics/adapters/parcelhub/transform/shipment'
import {
  transformRate,
  type ParcelHubRate,
} from '../../../../../src/verticals/logistics/adapters/parcelhub/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────
// Tracking and label transforms are tested under ./parcelhub/transform/.

function makeShipment(overrides: Partial<ParcelHubShipment> = {}): ParcelHubShipment {
  return {
    shipment_id: 'shp-ph-001',
    tracking_number: 'PH123456789',
    status: 'COLLECTED',
    label_url: 'https://api.parcelhub.co.uk/labels/shp-ph-001.pdf',
    service_code: 'NEXT_DAY',
    weight: 2.0,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Sender',
      address_line1: '10 Downing St',
      city: 'London',
      postal_code: 'SW1A 2AA',
      country: 'GB',
    },
    recipient: {
      name: 'Bob Receiver',
      address_line1: '1 Royal Mile',
      city: 'Edinburgh',
      postal_code: 'EH1 1YZ',
      country: 'GB',
    },
    reference: 'ORDER-UK-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<ParcelHubRate> = {}): ParcelHubRate {
  return {
    quote_id: 'Q-PH-001',
    service_code: 'NEXT_DAY',
    service_name: 'Next Day Delivery',
    total_amount: 8.99,
    currency: 'GBP',
    transit_days: 1,
    estimated_delivery_at: '2024-03-16T00:00:00Z',
    guaranteed: true,
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

// ─── transformShipment ──────────────────────────────────────────────────────

describe('ParcelHub transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-ph-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('PH123456789')
    expect(result.carrierId).toBe('parcelhub')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.reference).toBe('ORDER-UK-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('London')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Edinburgh')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
      label_url: null,
      sender: null,
      recipient: null,
      service_code: null,
      status: null,
      reference: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['COLLECTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('ParcelHub transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('Q-PH-001')
    expect(result.carrierId).toBe('parcelhub')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.serviceName).toBe('Next Day Delivery')
    expect(result.currency).toBe('GBP')
    expect(result.totalAmount).toBe(8.99)
    expect(result.transitDays).toBe(1)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      quote_id: null,
      service_code: null,
      service_name: null,
      total_amount: null,
      transit_days: null,
      estimated_delivery_at: null,
      guaranteed: null,
      created_at: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})
