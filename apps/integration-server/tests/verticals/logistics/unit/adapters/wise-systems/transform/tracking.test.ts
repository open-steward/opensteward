import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/tracking'
import { type WiseSystemsTask } from '../../../../../../../src/verticals/logistics/adapters/wise-systems/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<WiseSystemsTask> = {}): WiseSystemsTask {
  return {
    id: 'task-ws-trk-001',
    type: 'delivery',
    status: 2,
    location: {
      address1: '100 Main St',
      city: 'Phoenix',
      state: 'AZ',
      postal_code: '85001',
      country: 'US',
    },
    props: {
      completed_at: '2024-03-01T14:00:00Z',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformTracking (wise-systems)', () => {
  it('returns an array with one event', () => {
    expect(transformTracking(makeRaw())).toHaveLength(1)
  })

  it('maps shipmentId from raw.id', () => {
    expect(transformTracking(makeRaw())[0]?.shipmentId).toBe('task-ws-trk-001')
  })

  it('maps trackingNumber from raw.id', () => {
    expect(transformTracking(makeRaw())[0]?.trackingNumber).toBe('task-ws-trk-001')
  })

  it('sets carrierId to wise-systems', () => {
    expect(transformTracking(makeRaw())[0]?.carrierId).toBe('wise-systems')
  })

  it('maps status 2 delivery → OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeRaw({ status: 2, type: 'delivery' }))[0]?.status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status 2 pickup → IN_TRANSIT', () => {
    expect(transformTracking(makeRaw({ status: 2, type: 'pickup' }))[0]?.status).toBe('IN_TRANSIT')
  })

  it('maps status 0 → PRE_TRANSIT', () => {
    expect(transformTracking(makeRaw({ status: 0 }))[0]?.status).toBe('PRE_TRANSIT')
  })

  it('maps status 1 → PRE_TRANSIT', () => {
    expect(transformTracking(makeRaw({ status: 1 }))[0]?.status).toBe('PRE_TRANSIT')
  })

  it('maps status 3 → DELIVERED', () => {
    expect(transformTracking(makeRaw({ status: 3 }))[0]?.status).toBe('DELIVERED')
  })

  it('maps null status → UNKNOWN', () => {
    expect(transformTracking(makeRaw({ status: null }))[0]?.status).toBe('UNKNOWN')
  })

  it('maps description from type field', () => {
    expect(transformTracking(makeRaw({ type: 'delivery' }))[0]?.description).toBe(
      'Task type: delivery',
    )
  })

  it('sets description undefined when type is absent', () => {
    expect(transformTracking(makeRaw({ type: null }))[0]?.description).toBeUndefined()
  })

  it('maps location from raw.location', () => {
    const result = transformTracking(makeRaw())[0]
    expect(result?.location?.city).toBe('Phoenix')
    expect(result?.location?.country).toBe('US')
  })

  it('maps occurredAt from props.completed_at', () => {
    expect(transformTracking(makeRaw())[0]?.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back occurredAt to updated_at when completed_at absent', () => {
    const raw = makeRaw({ props: {} })
    expect(transformTracking(raw)[0]?.occurredAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTracking(raw)[0]?.metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const events = transformTracking(makeRaw())
    for (const evt of events) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })
})
