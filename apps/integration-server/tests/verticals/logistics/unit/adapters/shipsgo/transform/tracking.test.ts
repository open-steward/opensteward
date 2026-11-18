import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapTrackingStatus,
} from '../../../../../../../src/verticals/logistics/adapters/shipsgo/transform/tracking'
import type {
  ShipsGoContainer,
  ShipsGoMilestone,
} from '../../../../../../../src/verticals/logistics/adapters/shipsgo/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeMilestone(overrides: Partial<ShipsGoMilestone> = {}): ShipsGoMilestone {
  return {
    statusCode: 'sailing',
    status: 'Sailing',
    actualTime: '2024-03-02T06:00:00Z',
    estimatedTime: '2024-03-01T00:00:00Z',
    location: 'Shanghai Port',
    ...overrides,
  }
}

function makeContainer(overrides: Partial<ShipsGoContainer> = {}): ShipsGoContainer {
  return {
    shipmentId: 'SG-20001',
    containerNumber: 'OOLU9876543',
    mblNumber: 'MBL-2024-002',
    containerStatus: 'Sailing',
    shippingLine: 'OOCL',
    scac: 'OOLU',
    milestones: [
      makeMilestone(),
      makeMilestone({
        statusCode: 'arrived',
        status: 'Arrived',
        actualTime: '2024-03-20T10:00:00Z',
        location: 'LA Port',
      }),
    ],
    updatedDate: '2024-03-20T00:00:00Z',
    ...overrides,
  }
}

describe('mapTrackingStatus (shipsgo)', () => {
  it('maps milestone status codes correctly', () => {
    const cases: [string | null | undefined, string | null | undefined, string][] = [
      ['gate out', null, 'DELIVERED'],
      ['gateout', null, 'DELIVERED'],
      ['discharged', null, 'OUT_FOR_DELIVERY'],
      ['not released', null, 'OUT_FOR_DELIVERY'],
      ['arrived', null, 'IN_TRANSIT'],
      ['sailing', null, 'IN_TRANSIT'],
      ['in transit', null, 'IN_TRANSIT'],
      ['loaded', null, 'IN_TRANSIT'],
      ['booked', null, 'PRE_TRANSIT'],
      ['created', null, 'PRE_TRANSIT'],
      ['registered', null, 'PRE_TRANSIT'],
      ['exception', null, 'FAILURE'],
      ['failed', null, 'FAILURE'],
      [null, null, 'UNKNOWN'],
      ['', '', 'UNKNOWN'],
      ['something_else', null, 'UNKNOWN'],
    ]
    for (const [statusCode, status, expected] of cases) {
      expect(mapTrackingStatus(statusCode, status)).toBe(expected)
    }
  })

  it('uses status as fallback when statusCode is null', () => {
    expect(mapTrackingStatus(null, 'Sailing')).toBe('IN_TRANSIT')
  })
})

describe('transformTracking (shipsgo)', () => {
  it('produces one event per milestone', () => {
    expect(transformTracking(makeContainer())).toHaveLength(2)
  })

  it('maps trackingNumber from containerNumber', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.trackingNumber).toBe('OOLU9876543')
  })

  it('maps carrierId from scac (preferred over shippingLine)', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.carrierId).toBe('OOLU')
  })

  it('falls back to shippingLine when scac is null', () => {
    const [event] = transformTracking(makeContainer({ scac: null }))
    expect(event.carrierId).toBe('OOCL')
  })

  it('falls back to "shipsgo" when both scac and shippingLine are null', () => {
    const [event] = transformTracking(makeContainer({ scac: null, shippingLine: null }))
    expect(event.carrierId).toBe('shipsgo')
  })

  it('maps status from milestone statusCode', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps description from milestone status string', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.description).toBe('Sailing')
  })

  it('prefers actualTime over estimatedTime for occurredAt', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt!.toISOString()).toContain('2024-03-02')
  })

  it('falls back to estimatedTime when actualTime is null', () => {
    const container = makeContainer({
      milestones: [makeMilestone({ actualTime: null })],
    })
    const [event] = transformTracking(container)
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt!.toISOString()).toContain('2024-03-01')
  })

  it('maps location city from milestone.location', () => {
    const [event] = transformTracking(makeContainer())
    expect(event.location?.city).toBe('Shanghai Port')
  })

  it('location is undefined when milestone.location is null', () => {
    const container = makeContainer({
      milestones: [makeMilestone({ location: null })],
    })
    const [event] = transformTracking(container)
    expect(event.location).toBeUndefined()
  })

  it('emits a single synthetic fallback event when milestones is empty', () => {
    const events = transformTracking(makeContainer({ milestones: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('OOLU9876543')
    expect(events[0].carrierId).toBe('OOLU')
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('passes TrackingEventSchema.parse for each event without throwing', () => {
    for (const event of transformTracking(makeContainer())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
