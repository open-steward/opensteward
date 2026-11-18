import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type ClickPostTrackingResult,
  type ClickPostScan,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ClickPostScan is re-exported from tracking — include it in the type assertion to confirm
const _checkType: ClickPostScan = {
  status: 'Delivered',
  status_code: 60,
  location: 'Chennai, TN, IN',
  timestamp: '2024-03-01T14:00:00Z',
  clickpost_status_code: 60,
  clickpost_status_description: 'Delivered to customer',
  remark: null,
}
void _checkType

describe('clickpost transformTrackingEvent (re-export)', () => {
  const raw: ClickPostTrackingResult = {
    waybill: 'AWB-001',
    cp_id: 5,
    clickpost_status_code: 60,
    clickpost_status_description: 'Delivered',
    latest_status: 'Delivered',
    scans: [
      {
        status: 'Delivered',
        status_code: 60,
        location: 'Chennai, TN, IN',
        timestamp: '2024-03-01T14:00:00Z',
        clickpost_status_code: 60,
        clickpost_status_description: 'Delivered to customer',
        remark: null,
      },
    ],
    edd: null,
    order_id: 'ORD-001',
    reference_number: 'REF-001',
    is_rvp: null,
  }

  it('returns TrackingEvent array', () => {
    const result = transformTrackingEvent(raw)
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('maps status to DELIVERED for code 60', () => {
    expect(transformTrackingEvent(raw)[0].status).toBe('DELIVERED')
  })

  it('maps trackingNumber from waybill', () => {
    expect(transformTrackingEvent(raw)[0].trackingNumber).toBe('AWB-001')
  })

  it('maps carrierId from cp_id', () => {
    expect(transformTrackingEvent(raw)[0].carrierId).toBe('5')
  })

  it('maps location city, state, country from comma-separated string', () => {
    const e = transformTrackingEvent(raw)[0]
    expect(e.location?.city).toBe('Chennai')
    expect(e.location?.state).toBe('TN')
    expect(e.location?.country).toBe('IN')
  })

  it('each event passes TrackingEventSchema.parse', () => {
    transformTrackingEvent(raw).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})
