import { describe, it, expect } from 'vitest'
import {
  transformTrackingResult,
  type ClickPostTrackingResult,
  type ClickPostScan,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeScan(overrides: Partial<ClickPostScan> = {}): ClickPostScan {
  return {
    status: 'In Transit',
    status_code: 15,
    location: 'Mumbai, MH, IN',
    timestamp: '2024-03-01T10:00:00Z',
    clickpost_status_code: 15,
    clickpost_status_description: 'In transit to hub',
    remark: 'Package moving',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ClickPostTrackingResult> = {}): ClickPostTrackingResult {
  return {
    waybill: 'AWB-001',
    cp_id: 42,
    clickpost_status_code: 60,
    clickpost_status_description: 'Delivered',
    latest_status: 'Delivered',
    scans: [
      makeScan({ clickpost_status_code: 5, clickpost_status_description: 'Label created' }),
      makeScan(),
    ],
    edd: '2024-03-05T00:00:00Z',
    order_id: 'ORD-001',
    reference_number: 'REF-001',
    is_rvp: false,
    ...overrides,
  }
}

describe('clickpost transformTrackingResult', () => {
  it('returns one event per scan', () => {
    expect(transformTrackingResult(makeTracking())).toHaveLength(2)
  })

  it('maps trackingNumber, carrierId, status, description, location', () => {
    const e = transformTrackingResult(makeTracking())[0]
    expect(e.trackingNumber).toBe('AWB-001')
    expect(e.carrierId).toBe('42')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Label created')
    expect(e.location?.city).toBe('Mumbai')
    expect(e.location?.state).toBe('MH')
    expect(e.location?.country).toBe('IN')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('each event passes TrackingEventSchema.parse', () => {
    transformTrackingResult(makeTracking()).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })

  it('synthesises one event when scans is empty', () => {
    const r = transformTrackingResult(makeTracking({ scans: [] }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
    expect(r[0].description).toBe('Delivered')
  })

  it('maps status codes correctly', () => {
    const cases: Array<[number | null, string]> = [
      [5, 'PRE_TRANSIT'],
      [25, 'IN_TRANSIT'],
      [55, 'OUT_FOR_DELIVERY'],
      [60, 'DELIVERED'],
      [75, 'FAILURE'],
      [85, 'RETURN_TO_SENDER'],
      [null, 'UNKNOWN'],
      [99, 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const r = transformTrackingResult(
        makeTracking({ scans: [makeScan({ clickpost_status_code: code })] }),
      )
      expect(r[0].status).toBe(expected)
    }
  })

  it('parses location from comma-separated string', () => {
    const e = transformTrackingResult(
      makeTracking({ scans: [makeScan({ location: 'Delhi, DL, IN' })] }),
    )[0]
    expect(e.location?.city).toBe('Delhi')
    expect(e.location?.state).toBe('DL')
    expect(e.location?.country).toBe('IN')
  })

  it('returns undefined location for empty/null location', () => {
    const e = transformTrackingResult(makeTracking({ scans: [makeScan({ location: null })] }))[0]
    expect(e.location).toBeUndefined()
  })

  it('falls back to remark then status when clickpost_status_description is null', () => {
    const e = transformTrackingResult(
      makeTracking({
        scans: [
          makeScan({ clickpost_status_description: null, remark: 'On the way', status: 'Transit' }),
        ],
      }),
    )[0]
    expect(e.description).toBe('On the way')
  })

  it('falls back to scan.status when both description and remark are null', () => {
    const e = transformTrackingResult(
      makeTracking({
        scans: [makeScan({ clickpost_status_description: null, remark: null, status: 'Transit' })],
      }),
    )[0]
    expect(e.description).toBe('Transit')
  })

  it('sets carrierId to undefined when cp_id is null', () => {
    const e = transformTrackingResult(makeTracking({ cp_id: null, scans: [makeScan()] }))[0]
    expect(e.carrierId).toBeUndefined()
  })

  it('fallback event uses latest_status when clickpost_status_description is null', () => {
    const r = transformTrackingResult(
      makeTracking({
        scans: [],
        clickpost_status_description: null,
        latest_status: 'Delivered',
      }),
    )
    expect(r[0].description).toBe('Delivered')
  })
})
