import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type CargowiseShipmentTrackingResponse,
  type CargowiseMilestone,
} from '../../../../../../../src/verticals/logistics/adapters/cargowise/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeMilestone(overrides: Partial<CargowiseMilestone> = {}): CargowiseMilestone {
  return {
    milestoneCode: 'DEP',
    milestoneDescription: 'Departed Frankfurt',
    actualDate: '2024-03-01T08:00:00Z',
    estimatedDate: '2024-03-01T09:00:00Z',
    location: {
      port: 'FRA',
      portName: 'Frankfurt Airport',
      country: 'DE',
      city: 'Frankfurt',
    },
    ...overrides,
  }
}

function makeTracking(
  overrides: Partial<CargowiseShipmentTrackingResponse> = {},
): CargowiseShipmentTrackingResponse {
  return {
    shipmentId: 'CW-SHP-001',
    houseBillNumber: 'HBL123456',
    masterBillNumber: 'MBL789012',
    currentStatus: 'DEP',
    currentStatusDescription: 'Departed',
    milestones: [makeMilestone()],
    ...overrides,
  }
}

describe('transformTrackingEvents (cargowise)', () => {
  it('maps one event per milestone', () => {
    expect(transformTrackingEvents(makeTracking())).toHaveLength(1)
  })

  it('sets carrierId to cargowise on every event', () => {
    expect(transformTrackingEvents(makeTracking())[0].carrierId).toBe('cargowise')
  })

  it('uses houseBillNumber as trackingNumber', () => {
    expect(transformTrackingEvents(makeTracking())[0].trackingNumber).toBe('HBL123456')
  })

  it('falls back trackingNumber to shipmentId when houseBillNumber is absent', () => {
    const t = makeTracking({ houseBillNumber: undefined })
    expect(transformTrackingEvents(t)[0].trackingNumber).toBe('CW-SHP-001')
  })

  it('maps milestoneCode DEP → IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps milestoneCode DLV → DELIVERED', () => {
    const t = makeTracking({ milestones: [makeMilestone({ milestoneCode: 'DLV' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('DELIVERED')
  })

  it('maps milestoneCode BKD → PRE_TRANSIT', () => {
    const t = makeTracking({ milestones: [makeMilestone({ milestoneCode: 'BKD' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps milestoneCode ARR → IN_TRANSIT', () => {
    const t = makeTracking({ milestones: [makeMilestone({ milestoneCode: 'ARR' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('IN_TRANSIT')
  })

  it('maps unknown milestoneCode → UNKNOWN', () => {
    const t = makeTracking({ milestones: [makeMilestone({ milestoneCode: 'XYZ' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('UNKNOWN')
  })

  it('maps description from milestoneDescription', () => {
    expect(transformTrackingEvents(makeTracking())[0].description).toBe('Departed Frankfurt')
  })

  it('falls back description to milestoneCode when description is absent', () => {
    const t = makeTracking({ milestones: [makeMilestone({ milestoneDescription: undefined })] })
    expect(transformTrackingEvents(t)[0].description).toBe('DEP')
  })

  it('maps location from milestone.location', () => {
    const loc = transformTrackingEvents(makeTracking())[0].location
    expect(loc?.city).toBe('Frankfurt')
    expect(loc?.country).toBe('DE')
  })

  it('maps occurredAt from actualDate', () => {
    expect(transformTrackingEvents(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back occurredAt to estimatedDate when actualDate is absent', () => {
    const t = makeTracking({
      milestones: [makeMilestone({ actualDate: undefined, estimatedDate: '2024-03-01T09:00:00Z' })],
    })
    expect(transformTrackingEvents(t)[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns fallback event when milestones is empty', () => {
    const t = makeTracking({ milestones: [] })
    const events = transformTrackingEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT') // DEP maps to IN_TRANSIT
    expect(events[0].description).toBe('Departed')
  })

  it('omits location when no meaningful fields present', () => {
    const t = makeTracking({
      milestones: [makeMilestone({ location: { port: '', portName: '', country: '', city: '' } })],
    })
    expect(transformTrackingEvents(t)[0].location).toBeUndefined()
  })

  it('passes metadata as original milestone object', () => {
    const ms = makeMilestone()
    const t = makeTracking({ milestones: [ms] })
    expect(transformTrackingEvents(t)[0].metadata).toBe(ms)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    for (const e of transformTrackingEvents(makeTracking())) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
