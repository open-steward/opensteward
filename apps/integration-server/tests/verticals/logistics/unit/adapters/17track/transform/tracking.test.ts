import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  transformShipment,
  type Track17TrackItem,
  type Track17Event,
  type Track17Provider,
  type Track17EventAddress,
} from '../../../../../../../src/verticals/logistics/adapters/17track/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEventAddress(overrides: Partial<Track17EventAddress> = {}): Track17EventAddress {
  return {
    country: 'US',
    state: 'CA',
    city: 'Los Angeles',
    street: '123 Main St',
    postal_code: '90001',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<Track17Event> = {}): Track17Event {
  return {
    time_iso: '2024-03-01T00:00:00+00:00',
    time_utc: '2024-03-01T00:00:00Z',
    description: 'Package in transit',
    stage: 'InTransit',
    address: makeEventAddress(),
    ...overrides,
  }
}

function makeProvider(overrides: Partial<Track17Provider> = {}): Track17Provider {
  return {
    provider: 100,
    provider_name: 'UPS',
    events: [makeEvent()],
    ...overrides,
  }
}

function makeItem(overrides: Partial<Track17TrackItem> = {}): Track17TrackItem {
  return {
    number: 'TRK123456789',
    carrier: 100,
    track_info: {
      latest_status: { status: 'InTransit' },
      latest_event: makeEvent(),
      shipping_info: {
        shipper_address: makeEventAddress({ city: 'New York', state: 'NY', postal_code: '10001' }),
        recipient_address: makeEventAddress({
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
        }),
      },
      time_metrics: {
        estimated_delivery_date: { from: '2024-03-05T00:00:00Z', to: '2024-03-07T00:00:00Z' },
      },
      tracking: {
        providers: [makeProvider()],
      },
    },
    ...overrides,
  }
}

// ─── transformTrackingEvents — provider events path ───────────────────────────

describe('transformTrackingEvents — provider events path', () => {
  it('produces one event per provider event', () => {
    const item = makeItem()
    const events = transformTrackingEvents(item)
    expect(events).toHaveLength(1)
  })

  it('produces multiple events for multiple provider events', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [
            makeProvider({
              events: [makeEvent({ stage: 'InfoReceived' }), makeEvent({ stage: 'InTransit' })],
            }),
          ],
        },
      },
    })
    const events = transformTrackingEvents(item)
    expect(events).toHaveLength(2)
  })

  it('maps trackingNumber from item.number', () => {
    expect(transformTrackingEvents(makeItem())[0].trackingNumber).toBe('TRK123456789')
  })

  it('maps carrierId as string of item.carrier', () => {
    expect(transformTrackingEvents(makeItem())[0].carrierId).toBe('100')
  })

  it('maps carrierId to undefined when carrier is null', () => {
    expect(transformTrackingEvents(makeItem({ carrier: null }))[0].carrierId).toBeUndefined()
  })

  it('maps InTransit stage to IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeItem())[0].status).toBe('IN_TRANSIT')
  })

  it('maps InfoReceived stage to PRE_TRANSIT', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [makeProvider({ events: [makeEvent({ stage: 'InfoReceived' })] })] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps OutForDelivery stage to OUT_FOR_DELIVERY', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [makeProvider({ events: [makeEvent({ stage: 'OutForDelivery' })] })],
        },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Delivered stage to DELIVERED', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [makeProvider({ events: [makeEvent({ stage: 'Delivered' })] })] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('DELIVERED')
  })

  it('maps AvailableForPickup stage to AVAILABLE_FOR_PICKUP', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [makeProvider({ events: [makeEvent({ stage: 'AvailableForPickup' })] })],
        },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps DeliveryFailure stage to FAILURE', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [makeProvider({ events: [makeEvent({ stage: 'DeliveryFailure' })] })],
        },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('FAILURE')
  })

  it('maps Exception stage to FAILURE', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [makeProvider({ events: [makeEvent({ stage: 'Exception' })] })] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('FAILURE')
  })

  it('maps Expired stage to RETURN_TO_SENDER', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [makeProvider({ events: [makeEvent({ stage: 'Expired' })] })] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown stage to UNKNOWN', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [makeProvider({ events: [makeEvent({ stage: 'SomethingNew' })] })] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('UNKNOWN')
  })

  it('maps description from description_translation when present', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [
            makeProvider({
              events: [
                makeEvent({
                  description: 'Raw desc',
                  description_translation: { lang: 'en', description: 'Translated desc' },
                }),
              ],
            }),
          ],
        },
      },
    })
    expect(transformTrackingEvents(item)[0].description).toBe('Translated desc')
  })

  it('falls back to description when description_translation is absent', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [
            makeProvider({
              events: [makeEvent({ description: 'Raw desc', description_translation: null })],
            }),
          ],
        },
      },
    })
    expect(transformTrackingEvents(item)[0].description).toBe('Raw desc')
  })

  it('maps structured address to location', () => {
    const event = transformTrackingEvents(makeItem())[0]
    expect(event.location?.city).toBe('Los Angeles')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.country).toBe('US')
  })

  it('falls back to plain location string when address is absent', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: {
          providers: [
            makeProvider({ events: [makeEvent({ address: null, location: 'Shanghai, China' })] }),
          ],
        },
      },
    })
    const loc = transformTrackingEvents(item)[0].location
    // locationStringToAddress splits on comma: first part → city, last part → country
    expect(loc?.city).toBe('Shanghai')
    expect(loc?.country).toBe('China')
  })

  it('prefers time_utc over time_iso for occurredAt', () => {
    const event = transformTrackingEvents(makeItem())[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes metadata as the track item', () => {
    const item = makeItem()
    const events = transformTrackingEvents(item)
    events.forEach((e) => expect(e.metadata).toBe(item))
  })

  it('each event passes TrackingEventSchema validation', () => {
    transformTrackingEvents(makeItem()).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})

// ─── transformTrackingEvents — latest_event fallback ─────────────────────────

describe('transformTrackingEvents — latest_event fallback', () => {
  it('returns a single summary event when no provider events', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [] },
      },
    })
    const events = transformTrackingEvents(item)
    expect(events).toHaveLength(1)
  })

  it('fallback event uses latest_status for status', () => {
    const item = makeItem({
      track_info: {
        latest_status: { status: 'Delivered' },
        latest_event: makeEvent({ stage: null }),
        tracking: { providers: [] },
      },
    })
    expect(transformTrackingEvents(item)[0].status).toBe('DELIVERED')
  })

  it('fallback event passes TrackingEventSchema validation', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        tracking: { providers: [] },
      },
    })
    expect(() => TrackingEventSchema.parse(transformTrackingEvents(item)[0])).not.toThrow()
  })
})

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps trackingNumber from item.number', () => {
    expect(transformShipment(makeItem()).trackingNumber).toBe('TRK123456789')
  })

  it('maps carrierId as string of item.carrier', () => {
    expect(transformShipment(makeItem()).carrierId).toBe('100')
  })

  it('maps carrierId to undefined when carrier is null', () => {
    expect(transformShipment(makeItem({ carrier: null })).carrierId).toBeUndefined()
  })

  it('maps InTransit latest_status to IN_TRANSIT shipment status', () => {
    expect(transformShipment(makeItem()).status).toBe('IN_TRANSIT')
  })

  it('maps Delivered latest_status to DELIVERED', () => {
    const item = makeItem({
      track_info: { ...makeItem().track_info!, latest_status: { status: 'Delivered' } },
    })
    expect(transformShipment(item).status).toBe('DELIVERED')
  })

  it('maps InfoReceived latest_status to LABEL_CREATED', () => {
    const item = makeItem({
      track_info: { ...makeItem().track_info!, latest_status: { status: 'InfoReceived' } },
    })
    expect(transformShipment(item).status).toBe('LABEL_CREATED')
  })

  it('maps Exception latest_status to EXCEPTION', () => {
    const item = makeItem({
      track_info: { ...makeItem().track_info!, latest_status: { status: 'Exception' } },
    })
    expect(transformShipment(item).status).toBe('EXCEPTION')
  })

  it('maps Expired latest_status to RETURNED', () => {
    const item = makeItem({
      track_info: { ...makeItem().track_info!, latest_status: { status: 'Expired' } },
    })
    expect(transformShipment(item).status).toBe('RETURNED')
  })

  it('maps originAddress from shipper_address', () => {
    const result = transformShipment(makeItem())
    expect(result.originAddress?.city).toBe('New York')
    expect(result.originAddress?.state).toBe('NY')
  })

  it('maps destinationAddress from recipient_address', () => {
    const result = transformShipment(makeItem())
    expect(result.destinationAddress?.city).toBe('Los Angeles')
    expect(result.destinationAddress?.state).toBe('CA')
  })

  it('maps estimatedDeliveryAt from time_metrics.estimated_delivery_date.from', () => {
    const result = transformShipment(makeItem())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-05T00:00:00.000Z')
  })

  it('falls back to estimated_delivery_date.to when from is absent', () => {
    const item = makeItem({
      track_info: {
        ...makeItem().track_info!,
        time_metrics: { estimated_delivery_date: { from: null, to: '2024-03-07T00:00:00Z' } },
      },
    })
    expect(transformShipment(item).estimatedDeliveryAt?.toISOString()).toBe(
      '2024-03-07T00:00:00.000Z',
    )
  })

  it('passes metadata as the track item', () => {
    const item = makeItem()
    expect(transformShipment(item).metadata).toBe(item)
  })

  it('passes ShipmentSchema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeItem()))).not.toThrow()
  })
})
