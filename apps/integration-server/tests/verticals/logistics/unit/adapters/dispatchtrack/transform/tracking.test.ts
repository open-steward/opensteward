import { describe, it, expect } from 'vitest'
import {
  transformHistoryEvents,
  type DispatchTrackHistoryEvent,
} from '../../../../../../../src/verticals/logistics/adapters/dispatchtrack/transform/tracking'
import type { DispatchTrackServiceOrder } from '../../../../../../../src/verticals/logistics/adapters/dispatchtrack/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(o: Partial<DispatchTrackServiceOrder> = {}): DispatchTrackServiceOrder {
  return {
    id: 'dt-100',
    number: 'DT-TRK-100',
    status: 'delivered',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...o,
  }
}

function makeEvent(o: Partial<DispatchTrackHistoryEvent> = {}): DispatchTrackHistoryEvent {
  return {
    id: 'evt-1',
    status: 'delivered',
    description: 'Package delivered',
    occurred_at: '2024-03-01T11:00:00Z',
    city: 'San Francisco',
    ...o,
  }
}

describe('dispatchtrack transformHistoryEvents', () => {
  it('returns synthetic event from order when no history_events', () => {
    const result = transformHistoryEvents(makeOrder())
    expect(result).toHaveLength(1)
  })

  it('synthetic event: delivered status → DELIVERED', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'delivered' }))
    expect(result[0].status).toBe('DELIVERED')
  })

  it('synthetic event: pending status → PRE_TRANSIT', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'pending' }))
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('synthetic event: out_for_delivery → OUT_FOR_DELIVERY', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'out_for_delivery' }))
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('synthetic event: unable_to_finish → FAILURE', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'unable_to_finish' }))
    expect(result[0].status).toBe('FAILURE')
  })

  it('synthetic event: returned → RETURN_TO_SENDER', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'returned' }))
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('synthetic event: unknown status → UNKNOWN', () => {
    const result = transformHistoryEvents(makeOrder({ status: 'bogus_status' }))
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('synthetic event: carrierId is dispatchtrack', () => {
    const result = transformHistoryEvents(makeOrder())
    expect(result[0].carrierId).toBe('dispatchtrack')
  })

  it('synthetic event: trackingNumber uses number field', () => {
    const result = transformHistoryEvents(makeOrder())
    expect(result[0].trackingNumber).toBe('DT-TRK-100')
  })

  it('maps history_events when present', () => {
    const raw = makeOrder({
      history_events: [makeEvent(), makeEvent({ status: 'pending' })],
    } as DispatchTrackServiceOrder)
    const result = transformHistoryEvents(raw)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('DELIVERED')
    expect(result[1].status).toBe('PRE_TRANSIT')
  })

  it('history event: maps occurred_at as Date', () => {
    const raw = makeOrder({ history_events: [makeEvent()] } as DispatchTrackServiceOrder)
    const result = transformHistoryEvents(raw)
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('history event: maps city to location', () => {
    const raw = makeOrder({ history_events: [makeEvent()] } as DispatchTrackServiceOrder)
    const result = transformHistoryEvents(raw)
    expect(result[0].location?.city).toBe('San Francisco')
  })

  it('history event: maps description', () => {
    const raw = makeOrder({ history_events: [makeEvent()] } as DispatchTrackServiceOrder)
    const result = transformHistoryEvents(raw)
    expect(result[0].description).toBe('Package delivered')
  })

  it('passes TrackingEventSchema validation (synthetic event)', () => {
    const result = transformHistoryEvents(makeOrder())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('passes TrackingEventSchema validation (history event)', () => {
    const raw = makeOrder({ history_events: [makeEvent()] } as DispatchTrackServiceOrder)
    const result = transformHistoryEvents(raw)
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('metadata of synthetic event is the raw order', () => {
    const raw = makeOrder()
    const result = transformHistoryEvents(raw)
    expect(result[0].metadata).toBe(raw)
  })
})
