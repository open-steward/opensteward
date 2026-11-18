import { describe, it, expect } from 'vitest'
import {
  transformAwbResponse,
  transformAwbStatusToShipment,
  type SamedayAwbResponse,
  type SamedayAwbStatusHistory,
  type SamedayExpeditionStatus,
} from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeAwbResponse(overrides: Partial<SamedayAwbResponse> = {}): SamedayAwbResponse {
  return {
    awbNumber: 'AWB-555',
    awbCost: 42.0,
    parcels: [{ position: 1, awbNumber: 'AWB-555-1' }],
    ...overrides,
  }
}

function makeExpeditionStatus(
  overrides: Partial<SamedayExpeditionStatus> = {},
): SamedayExpeditionStatus {
  return {
    statusId: 1,
    status: 1,
    statusLabel: 'In transit',
    statusState: 'in_transit',
    statusDate: '2024-03-01T00:00:00Z',
    county: 'Bucharest',
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
      awbNumber: 'AWB-555',
      awbWeight: 2.5,
      servicePayment: 42,
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

describe('sameday transformAwbResponse', () => {
  it('maps id and trackingNumber from awbNumber', () => {
    const r = transformAwbResponse(makeAwbResponse())
    expect(r.id).toBe('AWB-555')
    expect(r.trackingNumber).toBe('AWB-555')
  })

  it('sets status to LABEL_CREATED', () => {
    expect(transformAwbResponse(makeAwbResponse()).status).toBe('LABEL_CREATED')
  })

  it('sets carrierId to sameday', () => {
    expect(transformAwbResponse(makeAwbResponse()).carrierId).toBe('sameday')
  })

  it('maps cost amount from awbCost', () => {
    const r = transformAwbResponse(makeAwbResponse())
    expect(r.cost?.amount).toBe(42)
    expect(r.cost?.currency).toBe('RON')
  })

  it('preserves raw metadata', () => {
    const raw = makeAwbResponse()
    expect(transformAwbResponse(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformAwbResponse(makeAwbResponse())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

describe('sameday transformAwbStatusToShipment', () => {
  it('maps id and trackingNumber from passed awbNumber', () => {
    const r = transformAwbStatusToShipment(makeStatusHistory(), 'AWB-555')
    expect(r.id).toBe('AWB-555')
    expect(r.trackingNumber).toBe('AWB-555')
  })

  it('maps status via statusId 1 → IN_TRANSIT', () => {
    const r = transformAwbStatusToShipment(makeStatusHistory(), 'AWB-555')
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps status via statusId 2 → DELIVERED', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({ expeditionStatus: makeExpeditionStatus({ statusId: 2 }) }),
      'AWB-555',
    )
    expect(r.status).toBe('DELIVERED')
  })

  it('maps status via statusId 3 → OUT_FOR_DELIVERY', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({ expeditionStatus: makeExpeditionStatus({ statusId: 3 }) }),
      'AWB-555',
    )
    expect(r.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status via statusId 4 → EXCEPTION', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({ expeditionStatus: makeExpeditionStatus({ statusId: 4 }) }),
      'AWB-555',
    )
    expect(r.status).toBe('EXCEPTION')
  })

  it('maps status via statusId 5 → RETURNED', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({ expeditionStatus: makeExpeditionStatus({ statusId: 5 }) }),
      'AWB-555',
    )
    expect(r.status).toBe('RETURNED')
  })

  it('maps status via statusState when statusId is unknown', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({
        expeditionStatus: makeExpeditionStatus({ statusId: 999, statusState: 'canceled' }),
      }),
      'AWB-555',
    )
    expect(r.status).toBe('CANCELLED')
  })

  it('maps totalWeight from awbWeight', () => {
    const r = transformAwbStatusToShipment(makeStatusHistory(), 'AWB-555')
    expect(r.totalWeight?.value).toBe(2.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps actualDeliveryAt when deliveredAt is set', () => {
    const r = transformAwbStatusToShipment(
      makeStatusHistory({
        expeditionSummary: {
          delivered: true,
          canceled: false,
          deliveryAttempts: 1,
          awbNumber: 'AWB-555',
          awbWeight: 2.5,
          servicePayment: 42,
          cashOnDelivery: 0,
          redirectionsAttempts: 0,
          deliveredAt: '2024-03-01T00:00:00Z',
          lastDeliveryAttempt: null,
        },
      }),
      'AWB-555',
    )
    expect(r.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('preserves raw metadata', () => {
    const raw = makeStatusHistory()
    expect(transformAwbStatusToShipment(raw, 'AWB-555').metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformAwbStatusToShipment(makeStatusHistory(), 'AWB-555')
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
