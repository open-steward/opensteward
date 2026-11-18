import { describe, it, expect } from 'vitest'
import { transformTracker, type AfterShipTracking, type AfterShipCheckpoint } from '../../../../../src/verticals/logistics/adapters/aftership/transform/tracking'
import { transformCarrier, type AfterShipCourier } from '../../../../../src/verticals/logistics/adapters/aftership/transform/carrier'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCheckpoint(overrides: Partial<AfterShipCheckpoint> = {}): AfterShipCheckpoint {
  return {
    checkpoint_time: '2024-01-15T14:30:00Z',
    message: 'Package arrived at facility',
    tag: 'InTransit',
    subtag: 'InTransit_002',
    subtag_message: 'Departed shipping partner facility, USPS awaiting item',
    city: 'San Francisco',
    state: 'CA',
    zip: '94105',
    country_iso3: 'USA',
    country_name: 'United States',
    location: 'San Francisco, CA, 94105, USA',
    slug: 'usps',
    created_at: '2024-01-15T14:35:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<AfterShipTracking> = {}): AfterShipTracking {
  return {
    id: 'trk_aftership_abc123',
    tracking_number: '9400111899223397643730',
    slug: 'usps',
    tag: 'InTransit',
    subtag: 'InTransit_002',
    subtag_message: 'In transit to destination',
    title: '9400111899223397643730',
    active: true,
    origin_country_iso3: 'USA',
    origin_city: 'San Francisco',
    origin_state: 'CA',
    origin_postal_code: '94105',
    destination_country_iso3: 'USA',
    destination_city: 'Austin',
    destination_state: 'TX',
    destination_postal_code: '78701',
    signed_by: null,
    transit_time: 3,
    checkpoints: [makeCheckpoint()],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T14:35:00Z',
    order_id: null,
    order_number: null,
    courier_tracking_link: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223397643730',
    shipment_delivery_date: '2024-01-18T00:00:00Z',
    shipment_pickup_date: '2024-01-15T08:00:00Z',
    ...overrides,
  }
}

function makeCourier(overrides: Partial<AfterShipCourier> = {}): AfterShipCourier {
  return {
    slug: 'fedex',
    name: 'FedEx',
    phone: '+1 800 463 3339',
    other_name: 'Federal Express',
    web_url: 'https://www.fedex.com',
    required_fields: ['tracking_number'],
    optional_fields: ['destination_postal_code'],
    default_language: 'en',
    support_languages: ['en', 'es', 'fr'],
    service_from_country_iso3: ['USA', 'CAN', 'GBR'],
    ...overrides,
  }
}

// ─── transformTracker ─────────────────────────────────────────────────────────

describe('transformTracker', () => {
  it('produces one event per checkpoint', () => {
    const raw = makeTracking()
    const events = transformTracker(raw)
    expect(events).toHaveLength(1)
  })

  it('maps checkpoint fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracker(raw)[0]

    expect(event.trackingNumber).toBe('9400111899223397643730')
    expect(event.carrierId).toBe('usps')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Departed shipping partner facility, USPS awaiting item')
    expect(event.location?.city).toBe('San Francisco')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.postalCode).toBe('94105')
    expect(event.location?.country).toBe('USA')
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata (raw tracking) on every event', () => {
    const raw = makeTracking()
    const events = transformTracker(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when checkpoints is empty', () => {
    const raw = makeTracking({ checkpoints: [] })
    const events = transformTracker(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].trackingNumber).toBe('9400111899223397643730')
  })

  it('uses message as fallback when subtag_message is null', () => {
    const raw = makeTracking({
      checkpoints: [makeCheckpoint({ subtag_message: null, message: 'Fallback message' })],
    })
    const event = transformTracker(raw)[0]
    expect(event.description).toBe('Fallback message')
  })

  it('returns undefined description when both subtag_message and message are null', () => {
    const raw = makeTracking({
      checkpoints: [makeCheckpoint({ subtag_message: null, message: null })],
    })
    const event = transformTracker(raw)[0]
    expect(event.description).toBeUndefined()
  })

  it('returns undefined location when all checkpoint location fields are null', () => {
    const raw = makeTracking({
      checkpoints: [
        makeCheckpoint({ city: null, state: null, zip: null, country_iso3: null, country_name: null }),
      ],
    })
    const event = transformTracker(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('produces multiple events for multiple checkpoints', () => {
    const raw = makeTracking({
      checkpoints: [
        makeCheckpoint({ tag: 'InfoReceived', checkpoint_time: '2024-01-14T10:00:00Z' }),
        makeCheckpoint({ tag: 'InTransit', checkpoint_time: '2024-01-15T14:30:00Z' }),
        makeCheckpoint({ tag: 'Delivered', checkpoint_time: '2024-01-17T09:00:00Z' }),
      ],
    })
    const events = transformTracker(raw)
    expect(events).toHaveLength(3)
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[1].status).toBe('IN_TRANSIT')
    expect(events[2].status).toBe('DELIVERED')
  })

  // ── Status enum coverage ──────────────────────────────────────────────────

  it('maps Pending to PRE_TRANSIT', () => {
    const raw = makeTracking({ tag: 'Pending', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps InfoReceived to PRE_TRANSIT', () => {
    const raw = makeTracking({ tag: 'InfoReceived', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps InTransit to IN_TRANSIT', () => {
    const raw = makeTracking({ tag: 'InTransit', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps OutForDelivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTracking({ tag: 'OutForDelivery', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps AttemptFail to FAILURE', () => {
    const raw = makeTracking({ tag: 'AttemptFail', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('FAILURE')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeTracking({ tag: 'Delivered', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('DELIVERED')
  })

  it('maps AvailableForPickup to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTracking({ tag: 'AvailableForPickup', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps Exception to FAILURE', () => {
    const raw = makeTracking({ tag: 'Exception', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('FAILURE')
  })

  it('maps Expired to FAILURE', () => {
    const raw = makeTracking({ tag: 'Expired', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown tag to UNKNOWN', () => {
    const raw = makeTracking({ tag: 'NotARealTag', checkpoints: [] })
    expect(transformTracker(raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformCarrier ─────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps canonical fields', () => {
    const raw = makeCourier()
    const result = transformCarrier(raw)

    expect(result.id).toBe('fedex')
    expect(result.name).toBe('FedEx')
    expect(result.code).toBe('fedex')
    expect(result.isActive).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeCourier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('maps slug as both id and code', () => {
    const raw = makeCourier({ slug: 'ups' })
    const result = transformCarrier(raw)
    expect(result.id).toBe('ups')
    expect(result.code).toBe('ups')
  })

  it('handles courier with minimal fields', () => {
    const raw = makeCourier({
      phone: null,
      other_name: null,
      web_url: null,
      default_language: null,
      support_languages: null,
      service_from_country_iso3: null,
    })
    const result = transformCarrier(raw)
    expect(result.id).toBe('fedex')
    expect(result.name).toBe('FedEx')
    expect(result.isActive).toBe(true)
  })
})
