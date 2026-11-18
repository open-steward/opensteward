import { describe, it, expect } from 'vitest'
import { transformRmaToTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/tracking'
import type { ReturnGoRma } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/rma'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<ReturnGoRma> = {}): ReturnGoRma {
  return {
    id: 'rma-001',
    return_status: 'pending',
    status: 'pending',
    tracking_number: 'TRK-RG-001',
    carrier: 'USPS',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T06:00:00Z',
    shipment: {
      tracking_number: 'TRK-RG-001',
      carrier: 'USPS',
      status: undefined,
    },
    ...overrides,
  }
}

// ─── transformRmaToTrackingEvent ──────────────────────────────────────────────

describe('ReturnGO transformRmaToTrackingEvent', () => {
  it('maps tracking number from top-level field', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.trackingNumber).toBe('TRK-RG-001')
  })

  it('maps carrier id', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.carrierId).toBe('USPS')
  })

  it('maps pending return_status to PRE_TRANSIT', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('maps label_created to PRE_TRANSIT', () => {
    const result = transformRmaToTrackingEvent(makeRaw({ return_status: 'label_created' }))
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    const result = transformRmaToTrackingEvent(makeRaw({ shipment: { status: 'in_transit' } }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps received to DELIVERED', () => {
    const result = transformRmaToTrackingEvent(makeRaw({ return_status: 'received' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps exception to FAILURE', () => {
    const result = transformRmaToTrackingEvent(makeRaw({ return_status: 'exception' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps cancelled to FAILURE', () => {
    const result = transformRmaToTrackingEvent(makeRaw({ return_status: 'cancelled' }))
    expect(result.status).toBe('FAILURE')
  })

  it('uses return_status as description', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.description).toBe('pending')
  })

  it('prefers shipment.status over return_status for canonical status mapping', () => {
    const result = transformRmaToTrackingEvent(
      makeRaw({ shipment: { status: 'in_transit' }, return_status: 'pending' }),
    )
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('parses occurredAt from updated_at', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('parses createdAt from created_at', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const result = transformRmaToTrackingEvent(makeRaw())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})
