import { describe, it, expect } from 'vitest'
import {
  transformAssetLocation,
  transformAssetEvent,
  type NBAssetLocation,
  type NBAssetEvent,
} from '../../../../../../../src/verticals/logistics/adapters/nextbillion-ai/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeAssetLocation(overrides: Partial<NBAssetLocation> = {}): NBAssetLocation {
  return {
    id: 'loc-001',
    asset_id: 'asset-42',
    lat: 41.8781,
    lng: -87.6298,
    timestamp: '2024-03-01T10:00:00Z',
    speed: 60,
    bearing: 90,
    altitude: 180,
    accuracy: 5,
    metadata: { source: 'gps' },
    ...overrides,
  }
}

function makeAssetEvent(overrides: Partial<NBAssetEvent> = {}): NBAssetEvent {
  return {
    id: 'evt-001',
    asset_id: 'asset-42',
    monitor_id: 'mon-001',
    type: 'geofence_enter',
    data: { geofence_id: 'geo-001' },
    timestamp: '2024-03-01T10:30:00Z',
    ...overrides,
  }
}

describe('nextbillion-ai transformAssetLocation', () => {
  it('maps id from raw.id', () => {
    expect(transformAssetLocation(makeAssetLocation()).id).toBe('loc-001')
  })

  it('maps shipmentId from asset_id', () => {
    expect(transformAssetLocation(makeAssetLocation()).shipmentId).toBe('asset-42')
  })

  it('uses assetId parameter as fallback when asset_id is null', () => {
    const result = transformAssetLocation(makeAssetLocation({ asset_id: null }), 'fallback-asset')
    expect(result.shipmentId).toBe('fallback-asset')
  })

  it('maps trackingNumber from asset_id', () => {
    expect(transformAssetLocation(makeAssetLocation()).trackingNumber).toBe('asset-42')
  })

  it('hardcodes status as IN_TRANSIT for all location updates', () => {
    expect(transformAssetLocation(makeAssetLocation()).status).toBe('IN_TRANSIT')
  })

  it('includes lat/lng coordinates in description', () => {
    const result = transformAssetLocation(makeAssetLocation())
    expect(result.description).toContain('41.8781')
    expect(result.description).toContain('-87.6298')
  })

  it('omits description when lat and lng are null', () => {
    const result = transformAssetLocation(makeAssetLocation({ lat: null, lng: null }))
    expect(result.description).toBeUndefined()
  })

  it('maps occurredAt from timestamp', () => {
    const result = transformAssetLocation(makeAssetLocation())
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() =>
      TrackingEventSchema.parse(transformAssetLocation(makeAssetLocation())),
    ).not.toThrow()
  })
})

describe('nextbillion-ai transformAssetEvent', () => {
  it('maps id from raw.id', () => {
    expect(transformAssetEvent(makeAssetEvent()).id).toBe('evt-001')
  })

  it('maps shipmentId from asset_id', () => {
    expect(transformAssetEvent(makeAssetEvent()).shipmentId).toBe('asset-42')
  })

  it('uses assetId parameter as fallback when asset_id is null', () => {
    const result = transformAssetEvent(makeAssetEvent({ asset_id: null }), 'fallback-asset')
    expect(result.shipmentId).toBe('fallback-asset')
  })

  it('maps status "geofence_enter" → IN_TRANSIT', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'geofence_enter' })).status).toBe(
      'IN_TRANSIT',
    )
  })

  it('maps status "geofence_exit" → IN_TRANSIT', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'geofence_exit' })).status).toBe('IN_TRANSIT')
  })

  it('maps status "delivered" → DELIVERED', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status "pickup" → IN_TRANSIT', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'pickup' })).status).toBe('IN_TRANSIT')
  })

  it('maps status "failure" → FAILURE', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'failure' })).status).toBe('FAILURE')
  })

  it('maps unknown type → UNKNOWN', () => {
    expect(transformAssetEvent(makeAssetEvent({ type: 'mystery_event' })).status).toBe('UNKNOWN')
  })

  it('maps description from type field', () => {
    expect(transformAssetEvent(makeAssetEvent()).description).toBe('geofence_enter')
  })

  it('maps occurredAt from timestamp', () => {
    expect(transformAssetEvent(makeAssetEvent()).occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() => TrackingEventSchema.parse(transformAssetEvent(makeAssetEvent()))).not.toThrow()
  })
})
