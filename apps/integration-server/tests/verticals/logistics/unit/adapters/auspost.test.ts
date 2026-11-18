import { describe, it, expect } from 'vitest'
import { transformRate, type AusPostRateResult } from '../../../../../src/verticals/logistics/adapters/auspost/transform/rate'
import { transformTrackingEvents, type AusPostTrackingResult, type AusPostScanEvent } from '../../../../../src/verticals/logistics/adapters/auspost/transform/tracking'
import { transformShipment, type AusPostShipmentResponse } from '../../../../../src/verticals/logistics/adapters/auspost/transform/shipment'
import { transformLabel, type AusPostLabelResponse } from '../../../../../src/verticals/logistics/adapters/auspost/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResult(overrides: Partial<AusPostRateResult> = {}): AusPostRateResult {
  return {
    service_code: 'AUS_PARCEL_REGULAR',
    name: 'Parcel Post',
    price: 8.95,
    delivery_time: '2-4 business days',
    delivery_time_min_days: 2,
    delivery_time_max_days: 4,
    ...overrides,
  }
}

function makeScanEvent(overrides: Partial<AusPostScanEvent> = {}): AusPostScanEvent {
  return {
    date: '2024-01-16T14:30:00+11:00',
    description: 'Item in transit',
    status: 'In Transit',
    location: {
      suburb: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      country: 'AU',
    },
    ...overrides,
  }
}

function makeTrackingResult(overrides: Partial<AusPostTrackingResult> = {}): AusPostTrackingResult {
  return {
    tracking_id: '33A00012345678901234',
    status: 'In Transit',
    trackable_items: [
      {
        article_id: '33A00012345678901234',
        events: [makeScanEvent()],
        status: 'In Transit',
      },
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<AusPostShipmentResponse> = {}): AusPostShipmentResponse {
  return {
    shipment_id: 'SHP-001',
    tracking_id: '33A00012345678901234',
    service_code: 'AUS_PARCEL_REGULAR',
    status: 'CREATED',
    created_date: '2024-01-16T10:00:00+11:00',
    ...overrides,
  }
}

function makeLabelResponse(overrides: Partial<AusPostLabelResponse> = {}): AusPostLabelResponse {
  return {
    shipment_id: 'SHP-001',
    tracking_id: '33A00012345678901234',
    service_code: 'AUS_PARCEL_REGULAR',
    label_data: 'base64encodedlabeldata==',
    label_format: 'PDF',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResult()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('auspost')
    expect(result.serviceCode).toBe('AUS_PARCEL_REGULAR')
    expect(result.serviceName).toBe('Parcel Post')
    expect(result.currency).toBe('AUD')
    expect(result.totalAmount).toBe(8.95)
    expect(result.transitDays).toBe(4)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateResult()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per scan event', () => {
    const raw = makeTrackingResult()
    expect(transformTrackingEvents(raw)).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResult()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('33A00012345678901234')
    expect(event.carrierId).toBe('auspost')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Item in transit')
    expect(event.location?.city).toBe('Sydney')
    expect(event.location?.state).toBe('NSW')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    const raw = makeTrackingResult()
    transformTrackingEvents(raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when no trackable items', () => {
    const raw = makeTrackingResult({ trackable_items: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps Created to PRE_TRANSIT', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'Created' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'Delivered' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps Onboard for Delivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'Onboard for Delivery' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Delivered to Agent to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'Delivered to Agent' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps Returned to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'Returned' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResult({
      trackable_items: [{ article_id: '1', events: [makeScanEvent({ status: 'ZZ_Unknown' })] }],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('33A00012345678901234')
    expect(result.carrierId).toBe('auspost')
    expect(result.serviceCode).toBe('AUS_PARCEL_REGULAR')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeLabelResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.shipmentId).toBe('SHP-001')
    expect(result.trackingNumber).toBe('33A00012345678901234')
    expect(result.carrierId).toBe('auspost')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing label_data', () => {
    const raw = makeLabelResponse({ label_data: undefined })
    expect(transformLabel(raw).base64).toBeUndefined()
  })
})
