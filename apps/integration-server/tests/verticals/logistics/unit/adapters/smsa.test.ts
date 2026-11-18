import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SmsaTracking,
  type SmsaTrackingActivity,
} from '../../../../../src/verticals/logistics/adapters/smsa/transform/tracking'
import {
  transformShipment,
  type SmsaShipment,
} from '../../../../../src/verticals/logistics/adapters/smsa/transform/shipment'
import {
  transformRate,
  type SmsaRate,
} from '../../../../../src/verticals/logistics/adapters/smsa/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeActivity(overrides: Partial<SmsaTrackingActivity> = {}): SmsaTrackingActivity {
  return {
    activity: 'IN_HUB',
    detail: 'Shipment processed at Riyadh hub',
    date: '2024-03-15T10:30:00Z',
    location: 'Riyadh',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<SmsaTracking> = {}): SmsaTracking {
  return {
    awbno: 'SMSA123456789',
    status: 'IN_HUB',
    activities: [
      makeActivity({ activity: 'RECEIVED', detail: 'Shipment received', location: 'Jeddah' }),
      makeActivity(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SmsaShipment> = {}): SmsaShipment {
  return {
    awbno: 'SMSA123456789',
    status: 'RECEIVED',
    label_url: 'https://api.smsaexpress.com/labels/SMSA123456789.pdf',
    service_code: 'EXPRESS',
    weight: 3.0,
    weight_unit: 'kg',
    sender: {
      name: 'Ahmed Al-Rashid',
      address_line1: '123 King Fahd Road',
      city: 'Riyadh',
      postal_code: '11564',
      country: 'SA',
    },
    recipient: {
      name: 'Omar Hassan',
      address_line1: '456 Corniche Road',
      city: 'Jeddah',
      postal_code: '21452',
      country: 'SA',
    },
    reference: 'SA-REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<SmsaRate> = {}): SmsaRate {
  return {
    service_code: 'EXPRESS',
    service_name: 'SMSA Express',
    currency: 'SAR',
    amount: 45.0,
    transit_days: 2,
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per activity', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'SMSA123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking activity fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'SMSA123456789')[0]

    expect(event.trackingNumber).toBe('SMSA123456789')
    expect(event.carrierId).toBe('smsa')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment received')
    expect(event.location?.city).toBe('Jeddah')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'SMSA123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when activities is empty', () => {
    const raw = makeTracking({ activities: [] })
    const events = transformTracking(raw, 'SMSA123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('SMSA123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      activities: [makeActivity({ location: null })],
    })
    const event = transformTracking(raw, 'SMSA123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['RECEIVED', 'PRE_TRANSIT'],
      ['IN_HUB', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['HELD', 'AVAILABLE_FOR_PICKUP'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [activity, expected] of cases) {
      const raw = makeTracking({
        activities: [makeActivity({ activity })],
      })
      expect(transformTracking(raw, 'SMSA123456789')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('SMSA123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('SMSA123456789')
    expect(result.carrierId).toBe('smsa')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.labelUrl).toContain('SMSA123456789.pdf')
    expect(result.reference).toBe('SA-REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Ahmed Al-Rashid')
    expect(result.originAddress?.city).toBe('Riyadh')
    expect(result.destinationAddress?.name).toBe('Omar Hassan')
    expect(result.destinationAddress?.city).toBe('Jeddah')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.0)
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
      ['RECEIVED', 'PENDING'],
      ['IN_HUB', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['HELD', 'PENDING'],
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

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('EXPRESS')
    expect(result.carrierId).toBe('smsa')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.serviceName).toBe('SMSA Express')
    expect(result.currency).toBe('SAR')
    expect(result.totalAmount).toBe(45.0)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      service_code: null,
      service_name: null,
      currency: null,
      amount: null,
      transit_days: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.serviceName).toBeUndefined()
    expect(result.currency).toBe('SAR')
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
  })
})
