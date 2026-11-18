import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type FareyeShipmentTrackingResponse,
  type FareyeTrackingUpdate,
} from '../../../../../../../src/verticals/logistics/adapters/fareye/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeUpdate(overrides: Partial<FareyeTrackingUpdate> = {}): FareyeTrackingUpdate {
  return {
    timestamp: '2024-03-01T00:00:00Z',
    status: 'IN_TRANSIT',
    description: 'Package in transit to destination',
    location: {
      city: 'Delhi',
      state: 'DL',
      postalCode: '110001',
      country: 'IN',
    },
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<FareyeShipmentTrackingResponse> = {},
): FareyeShipmentTrackingResponse {
  return {
    shipmentId: 'FR-SHP-001',
    trackingNumber: 'FR-TRK-001',
    carrierId: 'fareye',
    currentStatus: 'IN_TRANSIT',
    currentStatusDescription: 'Shipment in transit',
    updates: [makeUpdate({ status: 'CREATED', description: 'Shipment created' }), makeUpdate()],
    ...overrides,
  }
}

// ─── transformTrackingEvents ──────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per update', () => {
    expect(transformTrackingEvents(makeResponse())).toHaveLength(2)
  })

  it('maps trackingNumber preferring raw.trackingNumber over shipmentId', () => {
    const event = transformTrackingEvents(makeResponse())[0]
    // raw.trackingNumber ?? raw.shipmentId → trackingNumber — verified in source
    expect(event.trackingNumber).toBe('FR-TRK-001')
  })

  it('falls back trackingNumber to shipmentId when trackingNumber absent', () => {
    const result = transformTrackingEvents(makeResponse({ trackingNumber: undefined }))
    expect(result[0].trackingNumber).toBe('FR-SHP-001')
  })

  it('maps carrierId from raw.carrierId', () => {
    // raw.carrierId → carrierId — verified in source
    expect(transformTrackingEvents(makeResponse())[0].carrierId).toBe('fareye')
  })

  it('defaults carrierId to "fareye" when absent', () => {
    const result = transformTrackingEvents(makeResponse({ carrierId: undefined }))
    expect(result[0].carrierId).toBe('fareye')
  })

  it('maps status: CREATED → PRE_TRANSIT via TRACKING_STATUS_MAP', () => {
    // TRACKING_STATUS_MAP['CREATED'] = 'PRE_TRANSIT' — verified in constants
    expect(transformTrackingEvents(makeResponse())[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status: IN_TRANSIT → IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeResponse())[1].status).toBe('IN_TRANSIT')
  })

  it('maps status: OUT_FOR_DELIVERY → OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(
      makeResponse({ updates: [makeUpdate({ status: 'OUT_FOR_DELIVERY' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status: DELIVERED → DELIVERED', () => {
    const result = transformTrackingEvents(
      makeResponse({ updates: [makeUpdate({ status: 'DELIVERED' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps status: DELIVERY_FAILED → FAILURE', () => {
    const result = transformTrackingEvents(
      makeResponse({ updates: [makeUpdate({ status: 'DELIVERY_FAILED' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps status: RETURNED → RETURN_TO_SENDER', () => {
    const result = transformTrackingEvents(
      makeResponse({ updates: [makeUpdate({ status: 'RETURNED' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    const result = transformTrackingEvents(
      makeResponse({ updates: [makeUpdate({ status: 'SOME_MYSTERY_STATUS' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps description from update', () => {
    expect(transformTrackingEvents(makeResponse())[0].description).toBe('Shipment created')
  })

  it('maps location from update.location', () => {
    const event = transformTrackingEvents(makeResponse())[1]
    // toAddress(update.location) → location — verified in source
    expect(event.location?.city).toBe('Delhi')
    expect(event.location?.country).toBe('IN')
  })

  it('maps occurredAt from update.timestamp to Date', () => {
    // new Date(update.timestamp) → occurredAt — verified in source
    expect(transformTrackingEvents(makeResponse())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns single fallback event when updates is empty', () => {
    const result = transformTrackingEvents(makeResponse({ updates: [] }))
    // empty updates → single summary from currentStatus — verified in source
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].description).toBe('Shipment in transit')
  })

  it('sets location to undefined when update.location has no fields', () => {
    const result = transformTrackingEvents(
      makeResponse({
        updates: [
          makeUpdate({
            location: {
              city: undefined,
              state: undefined,
              postalCode: undefined,
              country: undefined,
            },
          }),
        ],
      }),
    )
    expect(result[0].location).toBeUndefined()
  })

  it('parses each event as TrackingEventSchema without throwing', () => {
    transformTrackingEvents(makeResponse()).forEach((event) => {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    })
  })
})
