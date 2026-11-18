import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ParcellabTracking,
  type ParcellabCheckpoint,
} from '../../../../../../../src/verticals/logistics/adapters/parcellab/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCheckpoint(overrides: Partial<ParcellabCheckpoint> = {}): ParcellabCheckpoint {
  return {
    status: 'transit',
    status_text: 'Shipment in transit',
    status_details: 'Arrived at sorting centre',
    courier_status: 'IN_TRANSIT',
    timestamp: '2024-03-01T00:00:00Z',
    location: 'Frankfurt Hub',
    city: 'Frankfurt',
    zip: '60313',
    country: 'DE',
    exception: false,
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ParcellabTracking> = {}): ParcellabTracking {
  return {
    tracking_number: 'TRK-PL-TRK-001',
    courier: 'dhl',
    orderNo: 'ORD-001',
    external_id: 'ext-trk-001',
    last_delivery_status: {
      status_code: 'transit',
      status_text: 'In transit',
      status_details: 'At hub',
    },
    checkpoints: [
      makeCheckpoint({ status: 'pending', timestamp: '2024-03-01T00:00:00Z' }),
      makeCheckpoint(),
    ],
    zip_code: '10115',
    city: 'Berlin',
    destination_country_iso3: 'DEU',
    announced_delivery_date: '2024-03-04T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcellab transformTracking', () => {
  it('produces one event per checkpoint', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps trackingNumber from tracking_number on each event', () => {
    const events = transformTracking(makeTracking())
    expect(events[0].trackingNumber).toBe('TRK-PL-TRK-001')
    expect(events[1].trackingNumber).toBe('TRK-PL-TRK-001')
  })

  it('maps carrierId from courier on each event', () => {
    expect(transformTracking(makeTracking())[0].carrierId).toBe('dhl')
  })

  it('maps pending status to PRE_TRANSIT', () => {
    const events = transformTracking(makeTracking())
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('maps transit status to IN_TRANSIT', () => {
    const events = transformTracking(makeTracking())
    expect(events[1].status).toBe('IN_TRANSIT')
  })

  it('maps lastmile to OUT_FOR_DELIVERY', () => {
    const raw = makeTracking({ checkpoints: [makeCheckpoint({ status: 'lastmile' })] })
    expect(transformTracking(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps readytocollect to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTracking({ checkpoints: [makeCheckpoint({ status: 'readytocollect' })] })
    expect(transformTracking(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps delivered to DELIVERED', () => {
    const raw = makeTracking({ checkpoints: [makeCheckpoint({ status: 'delivered' })] })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })

  it('maps sentback to RETURN_TO_SENDER', () => {
    const raw = makeTracking({ checkpoints: [makeCheckpoint({ status: 'sentback' })] })
    expect(transformTracking(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps failed to FAILURE', () => {
    const raw = makeTracking({ checkpoints: [makeCheckpoint({ status: 'failed' })] })
    expect(transformTracking(raw)[0].status).toBe('FAILURE')
  })

  it('maps description from status_details when present', () => {
    expect(transformTracking(makeTracking())[1].description).toBe('Arrived at sorting centre')
  })

  it('falls back description to status_text when status_details is null', () => {
    const raw = makeTracking({
      checkpoints: [makeCheckpoint({ status_details: null, status_text: 'In transit text' })],
    })
    expect(transformTracking(raw)[0].description).toBe('In transit text')
  })

  it('maps location.city from checkpoint city', () => {
    expect(transformTracking(makeTracking())[1].location?.city).toBe('Frankfurt')
  })

  it('maps location.postalCode from checkpoint zip', () => {
    expect(transformTracking(makeTracking())[1].location?.postalCode).toBe('60313')
  })

  it('maps location.country from checkpoint country', () => {
    expect(transformTracking(makeTracking())[1].location?.country).toBe('DE')
  })

  it('omits location when all location fields are null', () => {
    const raw = makeTracking({
      checkpoints: [makeCheckpoint({ city: null, zip: null, country: null, location: null })],
    })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('parses checkpoint timestamp as occurredAt Date', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises fallback event from last_delivery_status when checkpoints empty', () => {
    const events = transformTracking(makeTracking({ checkpoints: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('fallback event description comes from last_delivery_status.status_details', () => {
    const events = transformTracking(makeTracking({ checkpoints: [] }))
    expect(events[0].description).toBe('At hub')
  })

  it('passes metadata as raw tracking object on each event', () => {
    const raw = makeTracking()
    transformTracking(raw).forEach((e) => {
      expect(e.metadata).toBe(raw)
    })
  })

  it('each event passes TrackingEventSchema validation', () => {
    transformTracking(makeTracking()).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})
