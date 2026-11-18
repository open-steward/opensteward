import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type MelhorEnvioTrackingResponse,
  type MelhorEnvioTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<MelhorEnvioTrackingEvent> = {}): MelhorEnvioTrackingEvent {
  return {
    status: 'in_transit',
    description: 'Package in transit',
    created_at: '2024-03-01T00:00:00Z',
    city: 'São Paulo',
    state: 'SP',
    zip: '01310-100',
    ...overrides,
  }
}

function makeTracking(
  overrides: Partial<MelhorEnvioTrackingResponse> = {},
): MelhorEnvioTrackingResponse {
  return {
    id: 'trk-77',
    tracking: 'BR999888777BR',
    status: 'in_transit',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('transformTracking (melhor-envio)', () => {
  it('returns one event per entry in events array', () => {
    const raw = makeTracking({ events: [makeEvent(), makeEvent({ status: 'delivered' })] })
    expect(transformTracking(raw)).toHaveLength(2)
  })

  it('maps carrierId to "melhor-envio"', () => {
    expect(transformTracking(makeTracking())[0].carrierId).toBe('melhor-envio')
  })

  it('maps trackingNumber from tracking field', () => {
    expect(transformTracking(makeTracking())[0].trackingNumber).toBe('BR999888777BR')
  })

  it('maps status IN_TRANSIT for "in_transit"', () => {
    expect(transformTracking(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps status DELIVERED for "delivered"', () => {
    const raw = makeTracking({ events: [makeEvent({ status: 'delivered' })] })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })

  it('maps status PRE_TRANSIT for "gerado"', () => {
    const raw = makeTracking({ events: [makeEvent({ status: 'gerado' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status OUT_FOR_DELIVERY for "saiu_para_entrega"', () => {
    const raw = makeTracking({ events: [makeEvent({ status: 'saiu_para_entrega' })] })
    expect(transformTracking(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps description from event description field', () => {
    expect(transformTracking(makeTracking())[0].description).toBe('Package in transit')
  })

  it('maps location from city and state', () => {
    const evt = transformTracking(makeTracking())[0]
    expect(evt.location?.city).toBe('São Paulo')
    expect(evt.location?.state).toBe('SP')
    expect(evt.location?.postalCode).toBe('01310-100')
  })

  it('maps occurredAt from created_at as Date', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits single fallback event when events array is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT') // uses top-level status "in_transit"
  })

  it('produces TrackingEventSchema-valid results', () => {
    const events = transformTracking(makeTracking())
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
