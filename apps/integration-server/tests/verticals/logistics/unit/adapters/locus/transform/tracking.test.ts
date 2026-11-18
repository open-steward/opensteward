import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  transformTrackingList,
  type LocusTask,
  type LocusTaskListResponse,
} from '../../../../../../../src/verticals/logistics/adapters/locus/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTask(o: Partial<LocusTask> = {}): LocusTask {
  return {
    taskId: 'task-1',
    clientTaskId: 'CLIENT-TASK-001',
    status: 'STARTED',
    statusCategory: 'In Transit',
    actualArrivalTime: '2024-03-01T00:00:00Z',
    startEpochMs: 1709251200000,
    endEpochMs: 1709254800000,
    locationAddress: {
      addressLine1: '100 Locus Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'IN',
      pinCode: '400001',
    },
    ...o,
  }
}

describe('locus transformTracking', () => {
  it('maps taskId to shipmentId', () => {
    expect(transformTracking(makeTask()).shipmentId).toBe('task-1')
  })

  it('maps clientTaskId to trackingNumber', () => {
    expect(transformTracking(makeTask()).trackingNumber).toBe('CLIENT-TASK-001')
  })

  it('falls back to taskId when clientTaskId absent', () => {
    expect(transformTracking(makeTask({ clientTaskId: undefined })).trackingNumber).toBe('task-1')
  })

  it('always sets carrierId to locus', () => {
    expect(transformTracking(makeTask()).carrierId).toBe('locus')
  })

  it('maps STARTED status to IN_TRANSIT', () => {
    expect(transformTracking(makeTask({ status: 'STARTED' })).status).toBe('IN_TRANSIT')
  })

  it('maps UNASSIGNED status to PRE_TRANSIT', () => {
    expect(transformTracking(makeTask({ status: 'UNASSIGNED' })).status).toBe('PRE_TRANSIT')
  })

  it('maps PENDING status to PRE_TRANSIT', () => {
    expect(transformTracking(makeTask({ status: 'PENDING' })).status).toBe('PRE_TRANSIT')
  })

  it('maps ASSIGNED status to IN_TRANSIT', () => {
    expect(transformTracking(makeTask({ status: 'ASSIGNED' })).status).toBe('IN_TRANSIT')
  })

  it('maps PICKUP_COMPLETE status to IN_TRANSIT', () => {
    expect(transformTracking(makeTask({ status: 'PICKUP_COMPLETE' })).status).toBe('IN_TRANSIT')
  })

  it('maps ARRIVED status to OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeTask({ status: 'ARRIVED' })).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERY_STARTED status to OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeTask({ status: 'DELIVERY_STARTED' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps DELIVERED status to DELIVERED', () => {
    expect(transformTracking(makeTask({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps COMPLETED status to DELIVERED', () => {
    expect(transformTracking(makeTask({ status: 'COMPLETED' })).status).toBe('DELIVERED')
  })

  it('maps FAILED status to FAILURE', () => {
    expect(transformTracking(makeTask({ status: 'FAILED' })).status).toBe('FAILURE')
  })

  it('maps CANCELLED status to FAILURE', () => {
    expect(transformTracking(makeTask({ status: 'CANCELLED' })).status).toBe('FAILURE')
  })

  it('maps RETURNED status to RETURN_TO_SENDER', () => {
    expect(transformTracking(makeTask({ status: 'RETURNED' })).status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformTracking(makeTask({ status: 'SOME_FUTURE_STATUS' })).status).toBe('UNKNOWN')
  })

  it('maps absent status to UNKNOWN', () => {
    expect(transformTracking(makeTask({ status: undefined })).status).toBe('UNKNOWN')
  })

  it('maps statusCategory to description', () => {
    expect(transformTracking(makeTask()).description).toBe('In Transit')
  })

  it('falls back to status as description when statusCategory absent', () => {
    expect(transformTracking(makeTask({ statusCategory: undefined })).description).toBe('STARTED')
  })

  it('prefers actualArrivalTime for occurredAt', () => {
    const result = transformTracking(makeTask())
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to endEpochMs when actualArrivalTime absent', () => {
    const result = transformTracking(makeTask({ actualArrivalTime: undefined }))
    expect(result.occurredAt).toBeInstanceOf(Date)
    // endEpochMs = 1709254800000
    expect(result.occurredAt?.getTime()).toBe(1709254800000)
  })

  it('falls back to startEpochMs when both actualArrivalTime and endEpochMs absent', () => {
    const result = transformTracking(
      makeTask({ actualArrivalTime: undefined, endEpochMs: undefined }),
    )
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.getTime()).toBe(1709251200000)
  })

  it('occurredAt is undefined when all time fields absent', () => {
    const result = transformTracking(
      makeTask({ actualArrivalTime: undefined, endEpochMs: undefined, startEpochMs: undefined }),
    )
    expect(result.occurredAt).toBeUndefined()
  })

  it('attaches metadata', () => {
    const raw = makeTask()
    expect(transformTracking(raw).metadata).toBe(raw)
  })

  it('validates against TrackingEventSchema', () => {
    const result = transformTracking(makeTask())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})

describe('locus transformTrackingList', () => {
  it('maps each task in data array', () => {
    const raw: LocusTaskListResponse = {
      data: [makeTask(), makeTask({ taskId: 'task-2', clientTaskId: 'CLIENT-TASK-002' })],
    }
    const result = transformTrackingList(raw)
    expect(result).toHaveLength(2)
    expect(result[0].shipmentId).toBe('task-1')
    expect(result[1].shipmentId).toBe('task-2')
  })

  it('returns empty array when data is empty', () => {
    expect(transformTrackingList({ data: [] })).toHaveLength(0)
  })

  it('returns empty array when data is absent', () => {
    expect(transformTrackingList({})).toHaveLength(0)
  })

  it('all events validate against TrackingEventSchema', () => {
    const raw: LocusTaskListResponse = { data: [makeTask()] }
    const result = transformTrackingList(raw)
    result.forEach((evt) => expect(() => TrackingEventSchema.parse(evt)).not.toThrow())
  })
})
