import { describe, it, expect } from 'vitest'
import { transformRate, type PitneyBowesRateDetail } from '../../../../../src/verticals/logistics/adapters/pitney-bowes/transform/rate'
import { transformTrackingEvents, type PitneyBowesTrackingResponse, type PitneyBowesScanEvent } from '../../../../../src/verticals/logistics/adapters/pitney-bowes/transform/tracking'
import { transformShipment, type PitneyBowesShipmentResponse } from '../../../../../src/verticals/logistics/adapters/pitney-bowes/transform/shipment'
import { transformLabel } from '../../../../../src/verticals/logistics/adapters/pitney-bowes/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateDetail(overrides: Partial<PitneyBowesRateDetail> = {}): PitneyBowesRateDetail {
  return {
    carrier: 'USPS',
    serviceId: 'PM',
    parcelType: 'PKG',
    totalCarrierCharge: 7.25,
    currencyCode: 'USD',
    deliveryCommitment: {
      estimatedDeliveryDateTime: '2024-01-20T00:00:00Z',
      minEstimatedNumberOfDays: 1,
      maxEstimatedNumberOfDays: 3,
    },
    ...overrides,
  }
}

function makeScanEvent(overrides: Partial<PitneyBowesScanEvent> = {}): PitneyBowesScanEvent {
  return {
    eventDateTime: '2024-01-16T14:30:00Z',
    eventCode: 'InTransit',
    eventDescription: 'In transit to destination',
    eventCity: 'Shelton',
    eventStateProvince: 'CT',
    eventPostalCode: '06484',
    eventCountry: 'US',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PitneyBowesTrackingResponse> = {}): PitneyBowesTrackingResponse {
  return {
    trackingNumber: '9400111899223033005282',
    packageStatus: 'InTransit',
    packageStatusDescription: 'In transit',
    scanDetailsList: [makeScanEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<PitneyBowesShipmentResponse> = {}): PitneyBowesShipmentResponse {
  return {
    shipmentId: 'USPS2200170000012345',
    parcelTrackingNumber: '9400111899223033005282',
    rates: [{ carrier: 'USPS', serviceId: 'PM' }],
    documents: [
      {
        type: 'SHIPPING_LABEL',
        contents: 'base64encodedlabeldata==',
        contentType: 'PDF',
      },
    ],
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateDetail()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('pitney-bowes')
    expect(result.serviceCode).toBe('PM')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(7.25)
    expect(result.transitDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateDetail()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing delivery commitment', () => {
    const raw = makeRateDetail({ deliveryCommitment: undefined })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per scan event', () => {
    const raw = makeTrackingResponse()
    expect(transformTrackingEvents(raw)).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('9400111899223033005282')
    expect(event.carrierId).toBe('pitney-bowes')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.location?.city).toBe('Shelton')
    expect(event.location?.state).toBe('CT')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    const raw = makeTrackingResponse()
    transformTrackingEvents(raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when scanDetailsList is empty', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'Delivered' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps OutForDelivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'OutForDelivery' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DeliveryAttempted to FAILURE', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'DeliveryAttempted' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps ReturnToSender to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'ReturnToSender' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps Manifest to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'Manifest' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ scanDetailsList: [makeScanEvent({ eventCode: 'ZZ_Unknown' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('USPS2200170000012345')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('9400111899223033005282')
    expect(result.carrierId).toBe('pitney-bowes')
    expect(result.serviceCode).toBe('PM')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── transformLabel ──────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformLabel(raw)

    expect(result.id).toBe('USPS2200170000012345')
    expect(result.shipmentId).toBe('USPS2200170000012345')
    expect(result.trackingNumber).toBe('9400111899223033005282')
    expect(result.carrierId).toBe('pitney-bowes')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64encodedlabeldata==')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing documents', () => {
    const raw = makeShipmentResponse({ documents: undefined })
    const result = transformLabel(raw)
    expect(result.format).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })
})
