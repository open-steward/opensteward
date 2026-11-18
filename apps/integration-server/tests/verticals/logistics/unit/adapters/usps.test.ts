import { describe, it, expect } from 'vitest'
import { transformTracking, type USPSTrackingResponse, type USPSTrackingEvent } from '../../../../../src/verticals/logistics/adapters/usps/transform/tracking'
import { transformRateResponse, type USPSRateResponse, type USPSRateOption, type USPSRate } from '../../../../../src/verticals/logistics/adapters/usps/transform/rate'
import { transformLabel, type USPSLabelMetadata } from '../../../../../src/verticals/logistics/adapters/usps/transform/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<USPSTrackingEvent> = {}): USPSTrackingEvent {
  return {
    eventType: 'USPS in possession of item',
    eventTimestamp: '2024-01-16T07:31:00Z',
    eventCountry: null,
    eventCity: 'San Francisco',
    eventState: 'CA',
    eventZIP: '94105',
    firm: null,
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<USPSTrackingResponse> = {}): USPSTrackingResponse {
  return {
    destinationCity: 'New York',
    destinationState: 'NY',
    destinationZIP: '10001',
    mailClass: 'Priority Mail',
    status: 'USPS in possession of item',
    statusCategory: 'In Transit',
    statusSummary: 'Your item is in transit to the destination.',
    trackingEvents: [
      makeTrackingEvent({ eventType: 'Shipping Label Created', eventTimestamp: '2024-01-15T10:00:00Z' }),
      makeTrackingEvent({ eventType: 'USPS in possession of item', eventTimestamp: '2024-01-16T07:31:00Z' }),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<USPSRate> = {}): USPSRate {
  return {
    description: 'Priority Mail Machinable Single-piece',
    priceType: 'RETAIL',
    price: 9.25,
    weight: 1.0,
    dimWeight: 0,
    mailClass: 'PRIORITY_MAIL',
    zone: '04',
    SKU: 'DPXX0XXXXR04050',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    fees: [],
    ...overrides,
  }
}

function makeRateOption(overrides: Partial<USPSRateOption> = {}): USPSRateOption {
  return {
    totalBasePrice: 9.25,
    totalPrice: 9.25,
    rates: [makeRate()],
    extraServices: [],
    ...overrides,
  }
}

function makeRateResponse(overrides: Partial<USPSRateResponse> = {}): USPSRateResponse {
  return {
    rateOptions: [
      makeRateOption(),
      makeRateOption({
        totalBasePrice: 5.50,
        totalPrice: 5.50,
        rates: [makeRate({ mailClass: 'GROUND_ADVANTAGE', price: 5.50, SKU: 'DGXX0XXXXR04050' })],
      }),
    ],
    ...overrides,
  }
}

function makeLabelMetadata(overrides: Partial<USPSLabelMetadata> = {}): USPSLabelMetadata {
  return {
    trackingNumber: '9205590164917312751089',
    postage: 9.25,
    zone: '04',
    weightUOM: 'lb',
    weight: 1.0,
    dimensionalWeight: 0,
    bannerText: null,
    serviceTypeCode: '055',
    SKU: 'DPXX0XXXXR04050',
    commitment: {
      name: 'Priority Mail 2-Day',
      scheduleDeliveryDate: '2024-01-17',
    },
    fees: [],
    extraServices: [],
    links: [],
    ...overrides,
  }
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('maps tracking events', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, '9205590164917312751089')

    expect(events).toHaveLength(2)
    expect(events[0].trackingNumber).toBe('9205590164917312751089')
    expect(events[0].carrierId).toBe('usps')
    expect(events[0].description).toBe('Shipping Label Created')
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps tracking location', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'TEST123')

    expect(events[0].location).toEqual({
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: undefined,
    })
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'TEST123')
    for (const event of events) {
      expect(event.metadata).toBe(raw)
    }
  })

  it('falls back to summary when no events', () => {
    const raw = makeTrackingResponse({ trackingEvents: [], statusCategory: 'Delivered', statusSummary: 'Delivered' })
    const events = transformTracking(raw, 'TEST123')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(events[0].description).toBe('Delivered')
  })

  it('maps status category values', () => {
    const cases: [string, string][] = [
      ['Pre-Shipment', 'PRE_TRANSIT'],
      ['Accepted', 'IN_TRANSIT'],
      ['In Transit', 'IN_TRANSIT'],
      ['Out for Delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Available for Pickup', 'AVAILABLE_FOR_PICKUP'],
      ['Return to Sender', 'RETURN_TO_SENDER'],
      ['Alert', 'FAILURE'],
      ['Unknown Status', 'UNKNOWN'],
    ]
    for (const [input, expected] of cases) {
      const events = transformTracking(
        makeTrackingResponse({ trackingEvents: [], statusCategory: input }),
        'TEST123',
      )
      expect(events[0].status).toBe(expected)
    }
  })

  it('handles null location fields', () => {
    const raw = makeTrackingResponse({
      trackingEvents: [makeTrackingEvent({ eventCity: null, eventState: null, eventZIP: null })],
    })
    const events = transformTracking(raw, 'TEST123')
    expect(events[0].location).toBeUndefined()
  })
})

// ─── Rates ────────────────────────────────────────────────────────────────────

describe('transformRateResponse', () => {
  it('maps rate options to rates', () => {
    const raw = makeRateResponse()
    const rates = transformRateResponse(raw)

    expect(rates).toHaveLength(2)
    expect(rates[0].carrierId).toBe('usps')
    expect(rates[0].serviceCode).toBe('priority-mail')
    expect(rates[0].serviceName).toBe('Priority Mail')
    expect(rates[0].currency).toBe('USD')
    expect(rates[0].totalAmount).toBe(9.25)
    expect(rates[0].retailAmount).toBe(9.25)

    expect(rates[1].serviceCode).toBe('ground-advantage')
    expect(rates[1].serviceName).toBe('USPS Ground Advantage')
    expect(rates[1].totalAmount).toBe(5.50)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateResponse()
    const rates = transformRateResponse(raw)
    expect(rates[0].metadata).toBe(raw)
  })

  it('handles empty rate options', () => {
    const raw = makeRateResponse({ rateOptions: [] })
    const rates = transformRateResponse(raw)
    expect(rates).toHaveLength(0)
  })
})

// ─── Label ────────────────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps all canonical fields', () => {
    const raw = makeLabelMetadata()
    const result = transformLabel(raw, 'PDF', 'base64data==')

    expect(result.id).toBe('9205590164917312751089')
    expect(result.trackingNumber).toBe('9205590164917312751089')
    expect(result.carrierId).toBe('usps')
    expect(result.serviceCode).toBe('DPXX0XXXXR04050')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.base64).toBe('base64data==')
    expect(result.cost).toEqual({ amount: 9.25, currency: 'USD' })
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabelMetadata()
    expect(transformLabel(raw, 'PDF').metadata).toBe(raw)
  })

  it('maps ZPL image type', () => {
    const raw = makeLabelMetadata()
    const result = transformLabel(raw, 'ZPL203DPI')
    expect(result.format).toBe('ZPL')
  })

  it('handles missing optional fields', () => {
    const raw = makeLabelMetadata({ SKU: null })
    const result = transformLabel(raw, 'PDF')
    expect(result.serviceCode).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })
})
