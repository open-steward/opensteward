import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PostNLTrackingResponse,
  type PostNLStatusEvent,
} from '../../../../../src/verticals/logistics/adapters/postnl/transform/tracking'
import {
  transformShipment,
  type PostNLResponseShipment,
} from '../../../../../src/verticals/logistics/adapters/postnl/transform/shipment'
import {
  transformLabel,
  transformLabels,
} from '../../../../../src/verticals/logistics/adapters/postnl/transform/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeStatusEvent(overrides: Partial<PostNLStatusEvent> = {}): PostNLStatusEvent {
  return {
    TimeStamp: '2024-03-15T10:30:00Z',
    StatusCode: 'InTransit',
    StatusDescription: 'Shipment is in transit',
    LocationCode: 'NL-AMS',
    DestinationLocationCode: 'NL-RTD',
    RouteCode: null,
    RouteName: 'Amsterdam',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PostNLTrackingResponse> = {}): PostNLTrackingResponse {
  return {
    CurrentStatus: {
      Barcode: '3STEST123456789',
      StatusCode: 'InTransit',
      Status: [
        makeStatusEvent({ StatusCode: 'Collected', StatusDescription: 'Shipment collected', RouteName: 'Den Haag' }),
        makeStatusEvent(),
      ],
      Addresses: null,
    },
    ...overrides,
  }
}

function makeResponseShipment(overrides: Partial<PostNLResponseShipment> = {}): PostNLResponseShipment {
  return {
    Barcode: '3STEST123456789',
    Errors: null,
    Warnings: null,
    Labels: [
      { Content: 'base64pdfcontent', Labeltype: 'Label', OutputType: 'PDF' },
    ],
    ProductCodeDelivery: '3085',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per status entry', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('3STEST123456789')
    expect(event.carrierId).toBe('postnl')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment collected')
    expect(event.location?.city).toBe('Den Haag')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when Status is empty', () => {
    const raw = makeTrackingResponse({
      CurrentStatus: {
        Barcode: '3STEST123456789',
        StatusCode: 'Unknown',
        Status: [],
        Addresses: null,
      },
    })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('3STEST123456789')
  })

  it('handles missing RouteName gracefully', () => {
    const raw = makeTrackingResponse({
      CurrentStatus: {
        Barcode: '3STEST123456789',
        StatusCode: 'InTransit',
        Status: [makeStatusEvent({ RouteName: null })],
        Addresses: null,
      },
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['Collected', 'PRE_TRANSIT'],
      ['InTransit', 'IN_TRANSIT'],
      ['Sorting', 'IN_TRANSIT'],
      ['Delivering', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['ReturnToSender', 'RETURN_TO_SENDER'],
      ['DeliveryAttempt', 'FAILURE'],
      ['SomethingElse', 'UNKNOWN'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw = makeTrackingResponse({
        CurrentStatus: {
          Barcode: '3STEST123456789',
          StatusCode: statusCode,
          Status: [makeStatusEvent({ StatusCode: statusCode })],
          Addresses: null,
        },
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeResponseShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('3STEST123456789')
    expect(result.trackingNumber).toBe('3STEST123456789')
    expect(result.carrierId).toBe('postnl')
    expect(result.serviceCode).toBe('3085')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeResponseShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeResponseShipment({
      ProductCodeDelivery: null,
      Labels: null,
    })
    const result = transformShipment(raw)
    expect(result.serviceCode).toBeUndefined()
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const shipment = makeResponseShipment()
    const entry = shipment.Labels![0]
    const result = transformLabel(entry, shipment)

    expect(result.id).toBe('3STEST123456789-Label')
    expect(result.shipmentId).toBe('3STEST123456789')
    expect(result.trackingNumber).toBe('3STEST123456789')
    expect(result.carrierId).toBe('postnl')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64pdfcontent')
  })

  it('passes through metadata unmodified', () => {
    const shipment = makeResponseShipment()
    const entry = shipment.Labels![0]
    const meta = transformLabel(entry, shipment).metadata
    expect(meta).toEqual({ ...shipment, _labelEntry: entry })
  })
})

describe('transformLabels', () => {
  it('returns all label variants from a shipment', () => {
    const shipment = makeResponseShipment({
      Labels: [
        { Content: 'pdf1', Labeltype: 'Label', OutputType: 'PDF' },
        { Content: 'pdf2', Labeltype: 'Return', OutputType: 'PDF' },
      ],
    })
    const labels = transformLabels(shipment)
    expect(labels).toHaveLength(2)
    expect(labels[0].id).toBe('3STEST123456789-Label')
    expect(labels[1].id).toBe('3STEST123456789-Return')
  })

  it('returns empty array when no labels exist', () => {
    const shipment = makeResponseShipment({ Labels: null })
    expect(transformLabels(shipment)).toEqual([])
  })

  it('returns empty array when labels array is empty', () => {
    const shipment = makeResponseShipment({ Labels: [] })
    expect(transformLabels(shipment)).toEqual([])
  })
})
