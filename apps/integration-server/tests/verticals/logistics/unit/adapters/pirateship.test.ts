import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PirateShipTrackingResponse,
  type PirateShipTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/pirateship/transform/tracking'
import {
  transformShipment,
  type PirateShipShipment,
} from '../../../../../src/verticals/logistics/adapters/pirateship/transform/shipment'
import {
  transformRate,
  type PirateShipRate,
} from '../../../../../src/verticals/logistics/adapters/pirateship/transform/rate'
import {
  transformLabel,
  type PirateShipLabel,
} from '../../../../../src/verticals/logistics/adapters/pirateship/transform/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PirateShipTrackingEvent> = {}): PirateShipTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Los Angeles, CA',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PirateShipTrackingResponse> = {}): PirateShipTrackingResponse {
  return {
    tracking_number: 'PS123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'LABEL_CREATED', description: 'Label created', location: 'San Francisco, CA' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<PirateShipShipment> = {}): PirateShipShipment {
  return {
    shipment_id: 'shp-ps-001',
    tracking_number: 'PS123456789',
    status: 'LABEL_CREATED',
    label_url: 'https://api.pirateship.com/labels/shp-ps-001.pdf',
    service_code: 'USPS_PRIORITY',
    weight: 12.5,
    weight_unit: 'oz',
    sender: {
      name: 'Alice Sender',
      address_line1: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    recipient: {
      name: 'Bob Receiver',
      address_line1: '456 Oak Ave',
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90001',
      country: 'US',
    },
    reference: 'ORDER-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<PirateShipRate> = {}): PirateShipRate {
  return {
    rate_id: 'rate-ps-001',
    service_code: 'USPS_PRIORITY',
    service_name: 'USPS Priority Mail',
    total_amount: 7.95,
    currency: 'USD',
    transit_days: 2,
    estimated_delivery_at: '2024-03-17T00:00:00Z',
    guaranteed: false,
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

function makeLabel(overrides: Partial<PirateShipLabel> = {}): PirateShipLabel {
  return {
    label_id: 'lbl-ps-001',
    shipment_id: 'shp-ps-001',
    tracking_number: 'PS123456789',
    service_code: 'USPS_PRIORITY',
    format: 'PDF',
    status: 'created',
    url: 'https://api.pirateship.com/labels/lbl-ps-001.pdf',
    base64: 'JVBERi0xLjQ=',
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Pirate Ship transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('PS123456789')
    expect(event.carrierId).toBe('pirateship')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Label created')
    expect(event.location?.city).toBe('San Francisco, CA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('PS123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['LABEL_CREATED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Pirate Ship transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-ps-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('PS123456789')
    expect(result.carrierId).toBe('pirateship')
    expect(result.serviceCode).toBe('USPS_PRIORITY')
    expect(result.labelUrl).toContain('shp-ps-001.pdf')
    expect(result.reference).toBe('ORDER-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('San Francisco')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(12.5)
    expect(result.totalWeight?.unit).toBe('oz')
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
      ['LABEL_CREATED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
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

describe('Pirate Ship transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-ps-001')
    expect(result.carrierId).toBe('pirateship')
    expect(result.serviceCode).toBe('USPS_PRIORITY')
    expect(result.serviceName).toBe('USPS Priority Mail')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(7.95)
    expect(result.transitDays).toBe(2)
    expect(result.isGuaranteedDelivery).toBe(false)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      rate_id: null,
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
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('Pirate Ship transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)

    expect(result.id).toBe('lbl-ps-001')
    expect(result.shipmentId).toBe('shp-ps-001')
    expect(result.trackingNumber).toBe('PS123456789')
    expect(result.carrierId).toBe('pirateship')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toContain('lbl-ps-001.pdf')
    expect(result.base64).toBe('JVBERi0xLjQ=')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeLabel({
      shipment_id: null,
      tracking_number: null,
      service_code: null,
      format: null,
      url: null,
      base64: null,
      created_at: null,
    })
    const result = transformLabel(raw)

    expect(result.shipmentId).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.format).toBe('PDF') // falls back to PDF
    expect(result.url).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })
})
