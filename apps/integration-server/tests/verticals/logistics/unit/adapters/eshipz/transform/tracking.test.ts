import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EshipzTrackingRecord,
  type EshipzCheckpoint,
} from '../../../../../../../src/verticals/logistics/adapters/eshipz/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCheckpoint(overrides: Partial<EshipzCheckpoint> = {}): EshipzCheckpoint {
  return {
    city: 'Bangalore',
    remark: 'Package picked up from sender',
    tag: 'pretransit',
    date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeRecord(overrides: Partial<EshipzTrackingRecord> = {}): EshipzTrackingRecord {
  return {
    awb: 'AWB111222333',
    slug: 'delhivery',
    tag: 'intransit',
    shipment_status: 'in_transit',
    checkpoints: [
      makeCheckpoint(),
      makeCheckpoint({
        city: 'Mumbai',
        remark: 'In transit hub',
        tag: 'intransit',
        date: '2024-03-02T00:00:00Z',
      }),
    ],
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('returns empty array when records array is empty', () => {
    expect(transformTracking([], 'track-1')).toEqual([])
  })

  it('produces one event per checkpoint', () => {
    expect(transformTracking([makeRecord()], 'track-1')).toHaveLength(2)
  })

  it('maps trackingNumber from record.awb', () => {
    const event = transformTracking([makeRecord()], 'track-1')[0]
    // record.awb → trackingNumber — verified in source
    expect(event.trackingNumber).toBe('AWB111222333')
  })

  it('maps carrierId from record.slug', () => {
    // record.slug → carrierId — verified in source
    expect(transformTracking([makeRecord()], 'track-1')[0].carrierId).toBe('delhivery')
  })

  it('maps shipmentId from trackId parameter', () => {
    expect(transformTracking([makeRecord()], 'shp-007')[0].shipmentId).toBe('shp-007')
  })

  it('maps status: pretransit → PRE_TRANSIT', () => {
    // mapTag('pretransit') → PRE_TRANSIT — verified in source
    expect(transformTracking([makeRecord()], 'track-1')[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status: intransit → IN_TRANSIT', () => {
    expect(transformTracking([makeRecord()], 'track-1')[1].status).toBe('IN_TRANSIT')
  })

  it('maps description from remark', () => {
    // cp.remark → description — verified in source
    expect(transformTracking([makeRecord()], 'track-1')[0].description).toBe(
      'Package picked up from sender',
    )
  })

  it('maps location city from checkpoint city', () => {
    // cp.city → toAddress({city}) — verified in source
    expect(transformTracking([makeRecord()], 'track-1')[0].location?.city).toBe('Bangalore')
  })

  it('maps occurredAt from checkpoint date to Date', () => {
    expect(transformTracking([makeRecord()], 'track-1')[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps all statuses correctly', () => {
    const tagCases: [string, string][] = [
      ['pretransit', 'PRE_TRANSIT'],
      ['booked', 'PRE_TRANSIT'],
      ['infotransit', 'IN_TRANSIT'],
      ['intransit', 'IN_TRANSIT'],
      ['outfordelivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['availableforpickup', 'AVAILABLE_FOR_PICKUP'],
      ['returntosender', 'RETURN_TO_SENDER'],
      ['rto', 'RETURN_TO_SENDER'],
      ['exception', 'FAILURE'],
      ['ndr', 'FAILURE'],
    ]
    for (const [tag, expected] of tagCases) {
      const record = makeRecord({ checkpoints: [makeCheckpoint({ tag })] })
      const events = transformTracking([record], 'track-1')
      expect(events[0].status).toBe(expected)
    }
  })

  it('returns empty array when checkpoints is empty', () => {
    const record = makeRecord({ checkpoints: [] })
    expect(transformTracking([record], 'track-1')).toEqual([])
  })

  it('parses each event as TrackingEventSchema without throwing', () => {
    transformTracking([makeRecord()], 'track-1').forEach((event) => {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    })
  })
})
