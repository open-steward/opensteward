import { describe, it, expect } from 'vitest'
import {
  transformParcelStatus,
  type PplCzParcelStatus,
  type PplCzTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<PplCzTrackingEvent> = {}): PplCzTrackingEvent {
  return {
    stateCode: 10,
    stateName: 'In transit',
    eventDate: '2024-03-01T00:00:00Z',
    location: { city: 'Prague', country: 'CZ', zipCode: '11000' },
    ...overrides,
  }
}

function makeParcelStatus(overrides: Partial<PplCzParcelStatus> = {}): PplCzParcelStatus {
  return {
    shipmentNumber: '41000012345',
    referenceId: 'REF-001',
    productType: 'BUSS',
    stateCode: 10,
    stateName: 'In transit',
    estimatedDeliveryDate: '2024-03-01T00:00:00Z',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('transformParcelStatus', () => {
  it('produces one event per events entry', () => {
    const raw = makeParcelStatus({ events: [makeEvent(), makeEvent({ stateCode: 20 })] })
    expect(transformParcelStatus(raw)).toHaveLength(2)
  })

  it('maps stateCode to canonical TrackingEventStatus', () => {
    const cases: [number, string][] = [
      [0, 'PRE_TRANSIT'],
      [5, 'PRE_TRANSIT'],
      [10, 'IN_TRANSIT'],
      [20, 'DELIVERED'],
      [21, 'OUT_FOR_DELIVERY'],
      [30, 'AVAILABLE_FOR_PICKUP'],
      [50, 'RETURN_TO_SENDER'],
      [90, 'FAILURE'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeParcelStatus({ events: [makeEvent({ stateCode: code })] })
      expect(transformParcelStatus(raw)[0].status).toBe(expected)
    }
  })

  it('maps shipmentNumber to trackingNumber and carrierId', () => {
    const events = transformParcelStatus(makeParcelStatus())
    expect(events[0].trackingNumber).toBe('41000012345')
    expect(events[0].carrierId).toBe('ppl-cz')
  })

  it('maps stateName to description', () => {
    const raw = makeParcelStatus({ events: [makeEvent({ stateName: 'Out for delivery' })] })
    expect(transformParcelStatus(raw)[0].description).toBe('Out for delivery')
  })

  it('maps location city and country', () => {
    const events = transformParcelStatus(makeParcelStatus())
    expect(events[0].location?.city).toBe('Prague')
    expect(events[0].location?.country).toBe('CZ')
    expect(events[0].location?.postalCode).toBe('11000')
  })

  it('emits a fallback summary event when events is empty', () => {
    const raw = makeParcelStatus({ events: [], stateCode: 20, stateName: 'Delivered' })
    const events = transformParcelStatus(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(events[0].description).toBe('Delivered')
  })

  it('does not attach location when all loc fields are absent', () => {
    const raw = makeParcelStatus({
      events: [makeEvent({ location: { city: null, country: null, zipCode: null } })],
    })
    expect(transformParcelStatus(raw)[0].location).toBeUndefined()
  })

  it('passes schema parse for all events', () => {
    const events = transformParcelStatus(makeParcelStatus())
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
