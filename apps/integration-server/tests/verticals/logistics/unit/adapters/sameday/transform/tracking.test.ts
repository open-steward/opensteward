import { describe, it, expect } from 'vitest'
import { transformStatusHistory } from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/tracking'
import type {
  SamedayAwbStatusHistory,
  SamedayExpeditionStatus,
} from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeExpeditionStatus(
  overrides: Partial<SamedayExpeditionStatus> = {},
): SamedayExpeditionStatus {
  return {
    statusId: 1,
    status: 1,
    statusLabel: 'In transit',
    statusState: 'in_transit',
    statusDate: '2024-03-01T00:00:00Z',
    county: 'Cluj',
    reason: null,
    transitLocation: null,
    ...overrides,
  }
}

function makeStatusHistory(
  overrides: Partial<SamedayAwbStatusHistory> = {},
): SamedayAwbStatusHistory {
  return {
    expeditionSummary: {
      delivered: false,
      canceled: false,
      deliveryAttempts: 0,
      awbNumber: 'AWB-999',
      awbWeight: 1.0,
      servicePayment: 20,
      cashOnDelivery: 0,
      redirectionsAttempts: 0,
      deliveredAt: null,
      lastDeliveryAttempt: null,
    },
    expeditionHistory: [makeExpeditionStatus()],
    parcelsStatus: [],
    expeditionStatus: makeExpeditionStatus(),
    ...overrides,
  }
}

describe('sameday transformStatusHistory', () => {
  it('produces one event per history entry', () => {
    const events = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(events).toHaveLength(1)
  })

  it('maps carrierId to sameday', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.carrierId).toBe('sameday')
  })

  it('maps trackingNumber from passed awbNumber', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.trackingNumber).toBe('AWB-999')
  })

  it('maps status via statusId 1 → IN_TRANSIT', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.status).toBe('IN_TRANSIT')
  })

  it('maps statusId 2 → DELIVERED', () => {
    const [e] = transformStatusHistory(
      makeStatusHistory({ expeditionHistory: [makeExpeditionStatus({ statusId: 2 })] }),
      'AWB-999',
    )
    expect(e.status).toBe('DELIVERED')
  })

  it('maps statusId 4 → FAILURE', () => {
    const [e] = transformStatusHistory(
      makeStatusHistory({ expeditionHistory: [makeExpeditionStatus({ statusId: 4 })] }),
      'AWB-999',
    )
    expect(e.status).toBe('FAILURE')
  })

  it('maps statusId 5 → RETURN_TO_SENDER', () => {
    const [e] = transformStatusHistory(
      makeStatusHistory({ expeditionHistory: [makeExpeditionStatus({ statusId: 5 })] }),
      'AWB-999',
    )
    expect(e.status).toBe('RETURN_TO_SENDER')
  })

  it('maps statusId 10 → PRE_TRANSIT', () => {
    const [e] = transformStatusHistory(
      makeStatusHistory({ expeditionHistory: [makeExpeditionStatus({ statusId: 10 })] }),
      'AWB-999',
    )
    expect(e.status).toBe('PRE_TRANSIT')
  })

  it('maps location from county', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.location?.state).toBe('Cluj')
  })

  it('maps description from statusLabel', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.description).toBe('In transit')
  })

  it('maps occurredAt from statusDate', () => {
    const [e] = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to single event from expeditionStatus when history is empty', () => {
    const events = transformStatusHistory(makeStatusHistory({ expeditionHistory: [] }), 'AWB-999')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('returns empty array when no history and no expeditionStatus', () => {
    const events = transformStatusHistory(
      makeStatusHistory({
        expeditionHistory: [],
        expeditionStatus: undefined as unknown as SamedayExpeditionStatus,
      }),
      'AWB-999',
    )
    expect(events).toHaveLength(0)
  })

  it('preserves metadata on each event', () => {
    transformStatusHistory(makeStatusHistory(), 'AWB-999').forEach((e) =>
      expect(e.metadata).toBeDefined(),
    )
  })

  it('passes TrackingEventSchema validation for each event', () => {
    const events = transformStatusHistory(makeStatusHistory(), 'AWB-999')
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
