import { describe, it, expect } from 'vitest'
import { transformRate, type FedExRateReplyDetail } from '../../../../../src/verticals/logistics/adapters/fedex/transform/rate'
import { transformTrackResult, type FedExTrackResult, type FedExScanEvent } from '../../../../../src/verticals/logistics/adapters/fedex/transform/tracking'
import { transformShipment, type FedExTransactionShipment } from '../../../../../src/verticals/logistics/adapters/fedex/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/fedex/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateReplyDetail(overrides: Partial<FedExRateReplyDetail> = {}): FedExRateReplyDetail {
  return {
    serviceType: 'FEDEX_GROUND',
    serviceName: 'FedEx Ground',
    ratedShipmentDetails: [
      {
        rateType: 'ACCOUNT',
        totalBaseCharge: 15.5,
        totalNetCharge: 12.75,
        shipmentRateDetail: {
          currency: 'USD',
        },
      },
    ],
    commit: {
      dateDetail: {
        dayCxsFormat: '2024-01-20T00:00:00Z',
      },
    },
    ...overrides,
  }
}

function makeScanEvent(overrides: Partial<FedExScanEvent> = {}): FedExScanEvent {
  return {
    date: '2024-01-16T14:30:00Z',
    eventType: 'IT',
    eventDescription: 'In transit',
    scanLocation: {
      city: 'Memphis',
      stateOrProvinceCode: 'TN',
      countryCode: 'US',
      postalCode: '38118',
    },
    ...overrides,
  }
}

function makeTrackResult(overrides: Partial<FedExTrackResult> = {}): FedExTrackResult {
  return {
    trackingNumberInfo: {
      trackingNumber: '794644790138',
    },
    latestStatusDetail: {
      code: 'IT',
      description: 'In transit',
    },
    scanEvents: [makeScanEvent()],
    dateAndTimes: [
      { type: 'ESTIMATED_DELIVERY', dateTime: '2024-01-18T12:00:00Z' },
    ],
    ...overrides,
  }
}

function makeTransactionShipment(overrides: Partial<FedExTransactionShipment> = {}): FedExTransactionShipment {
  return {
    masterTrackingNumber: '794644790138',
    serviceType: 'FEDEX_GROUND',
    pieceResponses: [
      {
        trackingNumber: '794644790138',
        packageDocuments: [
          {
            document: 'base64encodedlabeldata==',
            documentFormat: 'PDF',
          },
        ],
      },
    ],
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateReplyDetail()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('FEDEX_GROUND')
    expect(result.serviceName).toBe('FedEx Ground')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(12.75)
    expect(result.retailAmount).toBe(15.5)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateReplyDetail()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing commit/delivery date', () => {
    const raw = makeRateReplyDetail({ commit: undefined })
    const result = transformRate(raw)
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('handles empty ratedShipmentDetails', () => {
    const raw = makeRateReplyDetail({ ratedShipmentDetails: [] })
    const result = transformRate(raw)
    expect(result.totalAmount).toBeUndefined()
    expect(result.retailAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('maps different service types', () => {
    const raw = makeRateReplyDetail({ serviceType: 'PRIORITY_OVERNIGHT', serviceName: 'FedEx Priority Overnight' })
    const result = transformRate(raw)
    expect(result.serviceCode).toBe('PRIORITY_OVERNIGHT')
    expect(result.serviceName).toBe('FedEx Priority Overnight')
  })
})

// ─── transformTrackResult ────────────────────────────────────────────────────

describe('transformTrackResult', () => {
  it('produces one event per scan event', () => {
    const raw = makeTrackResult()
    const events = transformTrackResult(raw)
    expect(events).toHaveLength(1)
  })

  it('maps scan event fields to canonical event', () => {
    const raw = makeTrackResult()
    const event = transformTrackResult(raw)[0]

    expect(event.trackingNumber).toBe('794644790138')
    expect(event.carrierId).toBe('fedex')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('In transit')
    expect(event.location?.city).toBe('Memphis')
    expect(event.location?.state).toBe('TN')
    expect(event.location?.country).toBe('US')
    expect(event.location?.postalCode).toBe('38118')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackResult()
    const events = transformTrackResult(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when scanEvents is empty', () => {
    const raw = makeTrackResult({ scanEvents: [] })
    const events = transformTrackResult(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In transit')
  })

  it('handles missing scanLocation gracefully', () => {
    const raw = makeTrackResult({
      scanEvents: [makeScanEvent({ scanLocation: undefined })],
    })
    const event = transformTrackResult(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps PU (Picked Up) to IN_TRANSIT', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'PU', description: 'Picked up' },
      scanEvents: [makeScanEvent({ eventType: 'PU' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps OD (Out for delivery) to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'OD', description: 'Out for delivery' },
      scanEvents: [makeScanEvent({ eventType: 'OD' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DL (Delivered) to DELIVERED', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'DL', description: 'Delivered' },
      scanEvents: [makeScanEvent({ eventType: 'DL' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('DELIVERED')
  })

  it('maps DE (Exception) to FAILURE', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'DE', description: 'Delivery exception' },
      scanEvents: [makeScanEvent({ eventType: 'DE' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('FAILURE')
  })

  it('maps RS (Return to shipper) to RETURN_TO_SENDER', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'RS', description: 'Return to shipper' },
      scanEvents: [makeScanEvent({ eventType: 'RS' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps RP (Return to shipper) to RETURN_TO_SENDER', () => {
    const raw = makeTrackResult({
      scanEvents: [makeScanEvent({ eventType: 'RP' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps OC (Order Created) to PRE_TRANSIT', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'OC', description: 'Shipment information sent to FedEx' },
      scanEvents: [makeScanEvent({ eventType: 'OC' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps unknown status code to UNKNOWN', () => {
    const raw = makeTrackResult({
      latestStatusDetail: { code: 'ZZ', description: 'Unknown' },
      scanEvents: [makeScanEvent({ eventType: 'ZZ' })],
    })
    expect(transformTrackResult(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing latestStatusDetail for summary event', () => {
    const raw = makeTrackResult({
      latestStatusDetail: undefined,
      scanEvents: [],
    })
    const events = transformTrackResult(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].description).toBeUndefined()
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeTransactionShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('794644790138')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('794644790138')
    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('FEDEX_GROUND')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTransactionShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing pieceResponses', () => {
    const raw = makeTransactionShipment({ pieceResponses: undefined })
    const result = transformShipment(raw)
    expect(result.id).toBe('794644790138')
    expect(result.trackingNumber).toBe('794644790138')
  })

  it('maps different service types', () => {
    const raw = makeTransactionShipment({ serviceType: 'FIRST_OVERNIGHT' })
    expect(transformShipment(raw).serviceCode).toBe('FIRST_OVERNIGHT')
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeTransactionShipment()
    const result = transformLabel(raw)

    expect(result.id).toBe('794644790138')
    expect(result.shipmentId).toBe('794644790138')
    expect(result.trackingNumber).toBe('794644790138')
    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('FEDEX_GROUND')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTransactionShipment()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('maps PNG format', () => {
    const raw = makeTransactionShipment({
      pieceResponses: [
        {
          trackingNumber: '794644790138',
          packageDocuments: [{ document: 'png-data', documentFormat: 'PNG' }],
        },
      ],
    })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('maps ZPL format', () => {
    const raw = makeTransactionShipment({
      pieceResponses: [
        {
          trackingNumber: '794644790138',
          packageDocuments: [{ document: 'zpl-data', documentFormat: 'ZPL' }],
        },
      ],
    })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('handles missing packageDocuments', () => {
    const raw = makeTransactionShipment({
      pieceResponses: [{ trackingNumber: '794644790138' }],
    })
    const result = transformLabel(raw)
    expect(result.format).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })

  it('handles missing pieceResponses', () => {
    const raw = makeTransactionShipment({ pieceResponses: undefined })
    const result = transformLabel(raw)
    expect(result.trackingNumber).toBe('794644790138')
    expect(result.format).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })

  it('uses masterTrackingNumber when pieceResponse trackingNumber matches', () => {
    const raw = makeTransactionShipment()
    expect(transformLabel(raw).trackingNumber).toBe('794644790138')
  })
})
