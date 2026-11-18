import { describe, it, expect } from 'vitest'
import { transformTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/trackingevent'
import type { ChazkiTrackingResponse } from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingResponse(
  overrides: Partial<ChazkiTrackingResponse> & Record<string, unknown> = {},
): ChazkiTrackingResponse & Record<string, unknown> {
  return {
    id: 'shp-001',
    tracking_number: 'TRK-001',
    status: 'DELIVERED',
    carrier: 'chazki',
    city: 'Lima',
    country: 'PE',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformTrackingEvent', () => {
  it('returns a single TrackingEvent (not an array)', () => {
    const result = transformTrackingEvent(makeTrackingResponse())
    expect(result).not.toBeInstanceOf(Array)
    expect(typeof result).toBe('object')
  })

  it('maps all core fields correctly', () => {
    const result = transformTrackingEvent(makeTrackingResponse())

    expect(result.trackingNumber).toBe('TRK-001')
    expect(result.carrierId).toBe('chazki')
    expect(result.status).toBe('DELIVERED')
    expect(result.location?.city).toBe('Lima')
    expect(result.location?.country).toBe('PE')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvent(makeTrackingResponse())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })

  // ─── Location handling ───────────────────────────────────────────────────────

  it('returns undefined location when city, state, and country are all missing', () => {
    const result = transformTrackingEvent(
      makeTrackingResponse({ city: undefined, state: undefined, country: undefined }),
    )
    expect(result.location).toBeUndefined()
  })

  it('includes state in location when provided', () => {
    const result = transformTrackingEvent(
      makeTrackingResponse({ city: 'Lima', state: 'Lima Region', country: 'PE' }),
    )
    expect(result.location?.state).toBe('Lima Region')
  })

  // ─── Tracking number fallbacks ───────────────────────────────────────────────

  it('falls back to tracking_code when tracking_number is null', () => {
    const result = transformTrackingEvent(
      makeTrackingResponse({ tracking_number: null, tracking_code: 'CODE-XYZ' }),
    )
    expect(result.trackingNumber).toBe('CODE-XYZ')
  })

  it('falls back to code when tracking_number and tracking_code are null', () => {
    const result = transformTrackingEvent(
      makeTrackingResponse({ tracking_number: null, tracking_code: null, code: 'CHZ-DIRECT' }),
    )
    expect(result.trackingNumber).toBe('CHZ-DIRECT')
  })

  // ─── shipmentId ─────────────────────────────────────────────────────────────

  it('uses shipment_id for shipmentId', () => {
    const result = transformTrackingEvent(makeTrackingResponse({ shipment_id: 'shp-999' }))
    expect(result.shipmentId).toBe('shp-999')
  })

  it('falls back to id for shipmentId when shipment_id is null', () => {
    const result = transformTrackingEvent(makeTrackingResponse({ shipment_id: null }))
    expect(result.shipmentId).toBe('shp-001')
  })

  // ─── Default carrierId ───────────────────────────────────────────────────────

  it('defaults carrierId to chazki when carrier is null', () => {
    const result = transformTrackingEvent(makeTrackingResponse({ carrier: null }))
    expect(result.carrierId).toBe('chazki')
  })

  // ─── Status mapping ──────────────────────────────────────────────────────────

  describe('status mapping', () => {
    it.each([
      ['NEW', 'PRE_TRANSIT'],
      ['GOTO_DELIVER', 'IN_TRANSIT'],
      ['ARRIVED_DELIVER', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['DISPONIBLE_PARA_RECOJO', 'AVAILABLE_FOR_PICKUP'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['FAILED_PICK', 'FAILURE'],
      ['unknown_val', 'UNKNOWN'],
    ] as const)('maps top-level status %s → %s', (chazkiStatus, expected) => {
      const result = transformTrackingEvent(makeTrackingResponse({ status: chazkiStatus }))
      expect(result.status).toBe(expected)
    })
  })
})
