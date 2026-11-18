import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type Locate2uTracking,
} from '../../../../../../../src/verticals/logistics/adapters/locate2u/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTracking(o: Partial<Locate2uTracking> = {}): Locate2uTracking {
  return {
    shipmentId: 3003,
    shipmentRef: 'LOC-TRK-001',
    status: 'intransit',
    tripDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
    dropStop: {
      stopId: 2,
      status: 'intransit',
      address: '20 Dropoff Ave',
      contact: { name: 'Carol White' },
      arrivalDate: '2024-03-01T00:00:00Z',
      notes: 'At destination',
    },
    ...o,
  }
}

describe('locate2u transformTracking — with dropStop', () => {
  it('emits one event per dropStop', () => {
    expect(transformTracking(makeTracking())).toHaveLength(1)
  })

  it('maps shipmentId to string', () => {
    expect(transformTracking(makeTracking())[0].shipmentId).toBe('3003')
  })

  it('maps shipmentRef to trackingNumber', () => {
    expect(transformTracking(makeTracking())[0].trackingNumber).toBe('LOC-TRK-001')
  })

  it('maps intransit dropStop status to IN_TRANSIT', () => {
    expect(transformTracking(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps unassigned dropStop status to PRE_TRANSIT', () => {
    const result = transformTracking(
      makeTracking({ dropStop: { stopId: 2, status: 'unassigned', address: '20 Ave' } }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps completed dropStop status to DELIVERED', () => {
    const result = transformTracking(
      makeTracking({ dropStop: { stopId: 2, status: 'completed', address: '20 Ave' } }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps failed dropStop status to FAILURE', () => {
    const result = transformTracking(
      makeTracking({ dropStop: { stopId: 2, status: 'failed', address: '20 Ave' } }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps dropStop notes to description', () => {
    expect(transformTracking(makeTracking())[0].description).toBe('At destination')
  })

  it('maps dropStop address to location', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].location?.street1).toBe('20 Dropoff Ave')
  })

  it('maps arrivalDate to occurredAt Date', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps lastModifiedDate to createdAt Date', () => {
    expect(transformTracking(makeTracking())[0].createdAt).toBeInstanceOf(Date)
  })

  it('attaches metadata', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('validates against TrackingEventSchema', () => {
    const result = transformTracking(makeTracking())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})

describe('locate2u transformTracking — no dropStop (fallback)', () => {
  it('emits one synthetic event when dropStop absent', () => {
    const result = transformTracking(makeTracking({ dropStop: undefined }))
    expect(result).toHaveLength(1)
  })

  it('uses top-level status for synthetic event', () => {
    const result = transformTracking(makeTracking({ dropStop: undefined, status: 'intransit' }))
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('synthetic event trackingNumber is set from shipmentRef', () => {
    const result = transformTracking(makeTracking({ dropStop: undefined }))
    expect(result[0].trackingNumber).toBe('LOC-TRK-001')
  })

  it('attaches metadata to synthetic event', () => {
    const raw = makeTracking({ dropStop: undefined })
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })
})
