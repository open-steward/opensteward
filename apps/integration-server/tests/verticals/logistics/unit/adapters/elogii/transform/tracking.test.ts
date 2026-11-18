import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  transformTrackingHistory,
  type ElogiiTaskHistoryEntry,
} from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/tracking'
import type { ElogiiTask } from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTask(o: Partial<ElogiiTask> = {}): ElogiiTask {
  return {
    _id: 'elo-trk-001',
    trackingCode: 'TRK-ELO-TRK-001',
    state: 2,
    location: {
      address: {
        street: '5 Track Rd',
        city: 'Denver',
        state: 'CO',
        country: 'US',
        postcode: '80201',
      },
    },
    updatedAt: '2024-03-01T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    ...o,
  }
}

function makeHistoryEntry(o: Partial<ElogiiTaskHistoryEntry> = {}): ElogiiTaskHistoryEntry {
  return {
    state: 3,
    createdAt: '2024-03-01T14:00:00Z',
    location: {
      address: {
        street: '10 Final St',
        city: 'Boulder',
        state: 'CO',
        country: 'US',
        postcode: '80301',
      },
    },
    description: 'Delivered successfully',
    ...o,
  }
}

describe('elogii transformTracking', () => {
  it('returns exactly one event', () => {
    expect(transformTracking(makeTask())).toHaveLength(1)
  })

  it('state 0 → PRE_TRANSIT', () => {
    expect(transformTracking(makeTask({ state: 0 }))[0].status).toBe('PRE_TRANSIT')
  })

  it('state 1 → PRE_TRANSIT', () => {
    expect(transformTracking(makeTask({ state: 1 }))[0].status).toBe('PRE_TRANSIT')
  })

  it('state 2 → IN_TRANSIT', () => {
    expect(transformTracking(makeTask())[0].status).toBe('IN_TRANSIT')
  })

  it('state 3 → DELIVERED', () => {
    expect(transformTracking(makeTask({ state: 3 }))[0].status).toBe('DELIVERED')
  })

  it('state 4 → FAILURE', () => {
    expect(transformTracking(makeTask({ state: 4 }))[0].status).toBe('FAILURE')
  })

  it('state 5 → RETURN_TO_SENDER', () => {
    expect(transformTracking(makeTask({ state: 5 }))[0].status).toBe('RETURN_TO_SENDER')
  })

  it('null state → UNKNOWN', () => {
    expect(transformTracking(makeTask({ state: null }))[0].status).toBe('UNKNOWN')
  })

  it('shipmentId is _id', () => {
    expect(transformTracking(makeTask())[0].shipmentId).toBe('elo-trk-001')
  })

  it('trackingNumber uses trackingCode', () => {
    expect(transformTracking(makeTask())[0].trackingNumber).toBe('TRK-ELO-TRK-001')
  })

  it('carrierId is elogii', () => {
    expect(transformTracking(makeTask())[0].carrierId).toBe('elogii')
  })

  it('maps location city', () => {
    expect(transformTracking(makeTask())[0].location?.city).toBe('Denver')
  })

  it('occurredAt derived from updatedAt when completedAt absent', () => {
    expect(transformTracking(makeTask())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('occurredAt prefers completedAt when present', () => {
    const task = makeTask({ completedAt: '2024-03-01T15:00:00Z' })
    const result = transformTracking(task)
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T15:00:00.000Z')
  })

  it('createdAt is a Date', () => {
    expect(transformTracking(makeTask())[0].createdAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeTask())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('metadata is the raw task', () => {
    const raw = makeTask()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })
})

describe('elogii transformTrackingHistory', () => {
  it('returns one event per history entry', () => {
    const result = transformTrackingHistory('elo-task-1', 'TRK-1', [
      makeHistoryEntry(),
      makeHistoryEntry({ state: 2 }),
    ])
    expect(result).toHaveLength(2)
  })

  it('state 3 → DELIVERED', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry()])
    expect(result[0].status).toBe('DELIVERED')
  })

  it('state 2 → IN_TRANSIT', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry({ state: 2 })])
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps description', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry()])
    expect(result[0].description).toBe('Delivered successfully')
  })

  it('shipmentId is taskId param', () => {
    const result = transformTrackingHistory('MY-TASK', 'MY-TRK', [makeHistoryEntry()])
    expect(result[0].shipmentId).toBe('MY-TASK')
  })

  it('trackingNumber is trackingCode param', () => {
    const result = transformTrackingHistory('MY-TASK', 'MY-TRK', [makeHistoryEntry()])
    expect(result[0].trackingNumber).toBe('MY-TRK')
  })

  it('maps location city from history entry', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry()])
    expect(result[0].location?.city).toBe('Boulder')
  })

  it('occurredAt is a Date', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry()])
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingHistory('id', 'trk', [makeHistoryEntry()])
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('metadata is the raw entry', () => {
    const entry = makeHistoryEntry()
    const result = transformTrackingHistory('id', 'trk', [entry])
    expect(result[0].metadata).toBe(entry)
  })
})
