import { describe, it, expect } from 'vitest'
import { transformReturnToTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/loop-returns/transform/tracking'
import type { LoopReturn } from '../../../../../../../src/verticals/logistics/adapters/loop-returns/transform/return'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<LoopReturn> = {}): LoopReturn {
  return {
    id: 555,
    state: 'open',
    label_status: 'created',
    carrier: 'UPS',
    tracking_number: 'TRK-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('loop-returns transformReturnToTrackingEvent', () => {
  it('maps carrierId from carrier', () => {
    expect(transformReturnToTrackingEvent(makeRaw({ carrier: 'UPS' })).carrierId).toBe('UPS')
  })

  it('maps trackingNumber', () => {
    expect(
      transformReturnToTrackingEvent(makeRaw({ tracking_number: 'TRK-001' })).trackingNumber,
    ).toBe('TRK-001')
  })

  it('pending label_status → PRE_TRANSIT regardless of state', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ label_status: 'pending', state: 'open' }),
    )
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('null label_status → PRE_TRANSIT', () => {
    const result = transformReturnToTrackingEvent(makeRaw({ label_status: null }))
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('state=open + label_status=created → IN_TRANSIT', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'open', label_status: 'created' }),
    )
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('state=closed → DELIVERED', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'closed', label_status: 'created' }),
    )
    expect(result.status).toBe('DELIVERED')
  })

  it('state=cancelled → FAILURE', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'cancelled', label_status: 'created' }),
    )
    expect(result.status).toBe('FAILURE')
  })

  it('state=expired → FAILURE', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'expired', label_status: 'created' }),
    )
    expect(result.status).toBe('FAILURE')
  })

  it('state=review → FAILURE', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'review', label_status: 'created' }),
    )
    expect(result.status).toBe('FAILURE')
  })

  it('unknown state → UNKNOWN', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ state: 'mystery', label_status: 'created' }),
    )
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps description from state', () => {
    expect(transformReturnToTrackingEvent(makeRaw({ state: 'open' })).description).toBe('open')
  })

  it('occurredAt uses updated_at when present', () => {
    const result = transformReturnToTrackingEvent(makeRaw({ updated_at: '2024-03-02T00:00:00Z' }))
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.toISOString()).toBe('2024-03-02T00:00:00.000Z')
  })

  it('occurredAt falls back to created_at when updated_at is null', () => {
    const result = transformReturnToTrackingEvent(
      makeRaw({ updated_at: null, created_at: '2024-03-01T00:00:00Z' }),
    )
    expect(result.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('createdAt is parsed as Date', () => {
    expect(transformReturnToTrackingEvent(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformReturnToTrackingEvent(raw).metadata).toBe(raw)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformReturnToTrackingEvent(makeRaw())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})
