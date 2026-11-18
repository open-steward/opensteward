import { describe, it, expect } from 'vitest'
import { transformRate, type SeraRate } from '../../../../../src/verticals/logistics/adapters/stamps/transform/rate'
import { transformLabel, type SeraLabelResponse } from '../../../../../src/verticals/logistics/adapters/stamps/transform/label'
// transformTrackingEvents / SeraTrackingEvent tests moved to
// unit/adapters/stamps/transform/tracking.test.ts — `GET /tracking` returned
// a bare array of {event_code, event_date, event_location}; the real,
// documented endpoint is `GET /v1/tracking`, which returns a single object
// ({tracking_number, status_code, tracking_events[]}) with different field
// names (occurred_at, city/state_province/postal_code/country_code,
// carrier_status_code).

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<SeraRate> = {}): SeraRate {
  return {
    carrier: 'usps',
    service_type: 'usps_priority_mail',
    packaging_type: 'package',
    estimated_delivery_days: '2',
    estimated_delivery_date: '2024-01-17T00:00:00Z',
    is_guaranteed_service: false,
    trackable: 'true',
    shipment_cost: {
      total_amount: 9.25,
      currency: 'USD',
      cost_details: [
        { fee_code: 'BASE', fee_type: 'base_charge', amount: 9.25 },
      ],
    },
    ...overrides,
  }
}

function makeLabelResponse(overrides: Partial<SeraLabelResponse> = {}): SeraLabelResponse {
  return {
    label_id: 'lbl_abc123',
    tracking_number: '9400111899223397643730',
    carrier: 'usps',
    service_type: 'usps_priority_mail',
    packaging_type: 'package',
    estimated_delivery_days: '2',
    estimated_delivery_date: '2024-01-17T00:00:00Z',
    is_guaranteed_service: false,
    trackable: 'true',
    shipment_cost: {
      total_amount: 9.25,
      currency: 'USD',
    },
    labels: [
      { href: 'https://api.stampsendicia.com/sera/v1/labels/lbl_abc123/download' },
    ],
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('usps')
    expect(result.serviceCode).toBe('usps_priority_mail')
    expect(result.serviceName).toBe('usps priority mail')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(9.25)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
    expect(result.isGuaranteedDelivery).toBe(false)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null optional fields', () => {
    const raw = makeRate({
      estimated_delivery_days: null,
      estimated_delivery_date: null,
      packaging_type: null,
    })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('parses estimated_delivery_days as integer from string', () => {
    const raw = makeRate({ estimated_delivery_days: '3' })
    expect(transformRate(raw).transitDays).toBe(3)
  })

  it('maps guaranteed service flag', () => {
    const raw = makeRate({ is_guaranteed_service: true })
    expect(transformRate(raw).isGuaranteedDelivery).toBe(true)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeLabelResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('lbl_abc123')
    expect(result.trackingNumber).toBe('9400111899223397643730')
    expect(result.carrierId).toBe('usps')
    expect(result.serviceCode).toBe('usps_priority_mail')
    expect(result.status).toBe('CREATED')
    expect(result.url).toContain('lbl_abc123/download')
    expect(result.cost?.amount).toBe(9.25)
    expect(result.cost?.currency).toBe('USD')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles null tracking_number', () => {
    const raw = makeLabelResponse({ tracking_number: null })
    expect(transformLabel(raw).trackingNumber).toBeUndefined()
  })

  it('handles null carrier', () => {
    const raw = makeLabelResponse({ carrier: null })
    expect(transformLabel(raw).carrierId).toBeUndefined()
  })

  it('handles null labels array', () => {
    const raw = makeLabelResponse({ labels: null })
    expect(transformLabel(raw).url).toBeUndefined()
  })

  it('handles empty labels array', () => {
    const raw = makeLabelResponse({ labels: [] })
    expect(transformLabel(raw).url).toBeUndefined()
  })

  it('handles null shipment_cost', () => {
    const raw = makeLabelResponse({ shipment_cost: null })
    expect(transformLabel(raw).cost).toBeUndefined()
  })
})

// ─── transformTrackingEvents ─────────────────────────────────────────────────
//
// Moved to unit/adapters/stamps/transform/tracking.test.ts — see the import
// comment above for why the old array-of-events fixture no longer matches
// the real `GET /v1/tracking` response shape.
