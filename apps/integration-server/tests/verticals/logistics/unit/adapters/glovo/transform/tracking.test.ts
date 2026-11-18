import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type GlovoTracking,
} from '../../../../../../../src/verticals/logistics/adapters/glovo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTracking(overrides: Partial<GlovoTracking> = {}): GlovoTracking {
  return {
    orderId: 'GLV-001',
    state: 'IN_TRANSIT',
    courierLat: 41.3851,
    courierLon: 2.1734,
    estimatedDeliveryTime: '2024-03-01T11:00:00Z',
    updatedAt: '2024-03-01T10:30:00Z',
    ...overrides,
  }
}

describe('Glovo transformTracking', () => {
  it('returns a single-element array', () => {
    expect(transformTracking(makeTracking())).toHaveLength(1)
  })

  it('maps shipmentId from orderId', () => {
    expect(transformTracking(makeTracking())[0].shipmentId).toBe('GLV-001')
  })

  it('sets carrierId to glovo', () => {
    expect(transformTracking(makeTracking())[0].carrierId).toBe('glovo')
  })

  it('maps IN_TRANSIT state → OUT_FOR_DELIVERY status', () => {
    expect(transformTracking(makeTracking({ state: 'IN_TRANSIT' }))[0].status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps ON_THE_WAY state → OUT_FOR_DELIVERY status', () => {
    expect(transformTracking(makeTracking({ state: 'ON_THE_WAY' }))[0].status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps PENDING state → PRE_TRANSIT status', () => {
    expect(transformTracking(makeTracking({ state: 'PENDING' }))[0].status).toBe('PRE_TRANSIT')
  })

  it('maps SCHEDULED state → PRE_TRANSIT status', () => {
    expect(transformTracking(makeTracking({ state: 'SCHEDULED' }))[0].status).toBe('PRE_TRANSIT')
  })

  it('maps ACCEPTED state → IN_TRANSIT status', () => {
    expect(transformTracking(makeTracking({ state: 'ACCEPTED' }))[0].status).toBe('IN_TRANSIT')
  })

  it('maps PICKING state → IN_TRANSIT status', () => {
    expect(transformTracking(makeTracking({ state: 'PICKING' }))[0].status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED state → DELIVERED status', () => {
    expect(transformTracking(makeTracking({ state: 'DELIVERED' }))[0].status).toBe('DELIVERED')
  })

  it('maps CANCELED state → FAILURE status', () => {
    expect(transformTracking(makeTracking({ state: 'CANCELED' }))[0].status).toBe('FAILURE')
  })

  it('maps CANCELLED state → FAILURE status', () => {
    expect(transformTracking(makeTracking({ state: 'CANCELLED' }))[0].status).toBe('FAILURE')
  })

  it('maps unknown state → UNKNOWN status', () => {
    expect(transformTracking(makeTracking({ state: 'GLITCH' }))[0].status).toBe('UNKNOWN')
  })

  it('builds location from courierLat and courierLon', () => {
    const result = transformTracking(makeTracking())[0]
    expect(result.location?.name).toBe('41.3851,2.1734')
  })

  it('omits location when courierLat is null', () => {
    const result = transformTracking(makeTracking({ courierLat: null }))[0]
    expect(result.location).toBeUndefined()
  })

  it('omits location when courierLon is null', () => {
    const result = transformTracking(makeTracking({ courierLon: null }))[0]
    expect(result.location).toBeUndefined()
  })

  it('maps occurredAt from updatedAt', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const result = transformTracking(makeTracking())[0]
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})
