import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type McfTrackingResponse,
  type McfTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/amazon-mcf/transform/tracking'
import {
  transformShipment,
  type McfShipment,
} from '../../../../../src/verticals/logistics/adapters/amazon-mcf/transform/shipment'
import {
  transformOrder,
  type McfOrder,
} from '../../../../../src/verticals/logistics/adapters/amazon-mcf/transform/order'

// ─── Factories ──────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<McfTrackingEvent> = {}): McfTrackingEvent {
  return {
    eventCode: 'EVENT_201',
    eventDate: '2025-04-02T09:00:00Z',
    eventDescription: 'Arrival scan',
    eventAddress: {
      city: 'Nashville',
      stateOrRegion: 'TN',
      countryCode: 'US',
      postalCode: '37201',
    },
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<McfTrackingResponse> = {},
): McfTrackingResponse {
  return {
    sellerFulfillmentOrderId: 'SFO-001',
    trackingNumber: 'MCF-TRK-001',
    carrierCode: 'UPS',
    trackingEvents: [
      makeTrackingEvent({ eventCode: 'EVENT_101', eventDescription: 'Shipment info sent' }),
      makeTrackingEvent(),
      makeTrackingEvent({ eventCode: 'EVENT_301', eventDescription: 'Delivered' }),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<McfShipment> = {}): McfShipment {
  return {
    amazonShipmentId: 'AMZ-SHP-001',
    fulfillmentShipmentStatus: 'SHIPPED',
    shippingSpeedCategory: 'Standard',
    destinationAddress: {
      name: 'Jane Doe',
      street1: '1 Main St',
      city: 'Nashville',
      state: 'TN',
      postalCode: '37201',
      country: 'US',
    },
    fulfillmentShipmentPackage: [
      {
        packageNumber: 1,
        carrierCode: 'UPS',
        trackingNumber: 'MCF-TRK-001',
        estimatedArrivalDate: '2025-04-05T00:00:00Z',
      },
    ],
    shippingDateTime: '2025-04-02T08:00:00Z',
    estimatedArrivalDateTime: '2025-04-05T00:00:00Z',
    weight: { value: 3, unit: 'kg' },
    ...overrides,
  }
}

function makeOrder(overrides: Partial<McfOrder> = {}): McfOrder {
  return {
    sellerFulfillmentOrderId: 'SFO-001',
    displayableOrderId: 'ORD-1001',
    fulfillmentOrderStatus: 'PROCESSING',
    destinationAddress: {
      name: 'Jane Doe',
      street1: '1 Main St',
      city: 'Nashville',
      state: 'TN',
      postalCode: '37201',
      country: 'US',
    },
    shippingSpeedCategory: 'Standard',
    displayableOrderComment: 'Please deliver before 5pm',
    displayableOrderDate: '2025-04-01T10:00:00Z',
    receivedDate: '2025-04-01T10:00:00Z',
    statusUpdatedDate: '2025-04-02T08:00:00Z',
    fulfillmentShipments: [{ amazonShipmentId: 'AMZ-SHP-001' }],
    items: [
      {
        sellerSku: 'SKU-ABC',
        sellerFulfillmentOrderItemId: 'itm-1',
        quantity: 2,
        displayableComment: 'Gift wrap',
        perUnitDeclaredValue: { currencyCode: 'USD', value: 19.99 },
      },
    ],
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Amazon MCF transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(3)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.shipmentId).toBe('SFO-001')
    expect(event.trackingNumber).toBe('MCF-TRK-001')
    expect(event.carrierId).toBe('amazon-mcf')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment info sent')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('maps location fields', () => {
    const event = transformTracking(makeTrackingResponse())[1]
    expect(event.location?.city).toBe('Nashville')
    expect(event.location?.state).toBe('TN')
    expect(event.location?.country).toBe('US')
    expect(event.location?.postalCode).toBe('37201')
  })

  it('passes through metadata unmodified', () => {
    const events = transformTracking(makeTrackingResponse())
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a fallback event when trackingEvents is empty', () => {
    const events = transformTracking(makeTrackingResponse({ trackingEvents: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null location gracefully', () => {
    const events = transformTracking(
      makeTrackingResponse({ trackingEvents: [makeTrackingEvent({ eventAddress: null })] }),
    )
    expect(events[0].location).toBeUndefined()
  })

  it('maps all event codes correctly', () => {
    const cases: [string, string][] = [
      ['EVENT_101', 'PRE_TRANSIT'],
      ['EVENT_102', 'IN_TRANSIT'],
      ['EVENT_201', 'IN_TRANSIT'],
      ['EVENT_202', 'IN_TRANSIT'],
      ['EVENT_204', 'OUT_FOR_DELIVERY'],
      ['EVENT_301', 'DELIVERED'],
      ['EVENT_302', 'FAILURE'],
      ['EVENT_308', 'RETURN_TO_SENDER'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['Returned', 'RETURN_TO_SENDER'],
      ['wat', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const events = transformTracking(
        makeTrackingResponse({ trackingEvents: [makeTrackingEvent({ eventCode })] }),
      )
      expect(events[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Amazon MCF transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('AMZ-SHP-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('MCF-TRK-001')
    expect(r.carrierId).toBe('amazon-mcf')
    expect(r.serviceCode).toBe('Standard')
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('maps destination address', () => {
    const r = transformShipment(makeShipment())
    expect(r.destinationAddress?.city).toBe('Nashville')
    expect(r.destinationAddress?.name).toBe('Jane Doe')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(3)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformShipment(
      makeShipment({
        fulfillmentShipmentStatus: null,
        shippingSpeedCategory: null,
        destinationAddress: null,
        fulfillmentShipmentPackage: [],
        weight: null,
        shippingDateTime: null,
        estimatedArrivalDateTime: null,
      }),
    )
    expect(r.status).toBe('UNKNOWN')
    expect(r.trackingNumber).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
    expect(r.totalWeight).toBeUndefined()
    expect(r.estimatedDeliveryAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['PENDING', 'PENDING'],
      ['SHIPPED', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['CANCELLED_BY_FULFILLER', 'CANCELLED'],
      ['CANCELLED_BY_SELLER', 'CANCELLED'],
      ['UNDELIVERABLE', 'EXCEPTION'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['wat', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(
        transformShipment(makeShipment({ fulfillmentShipmentStatus: status })).status,
      ).toBe(expected)
    }
  })
})

// ─── transformOrder ─────────────────────────────────────────────────────────

describe('Amazon MCF transformOrder', () => {
  it('maps canonical fields', () => {
    const r = transformOrder(makeOrder())
    expect(r.id).toBe('SFO-001')
    expect(r.orderNumber).toBe('ORD-1001')
    expect(r.status).toBe('PROCESSING')
    expect(r.requestedServiceCode).toBe('Standard')
    expect(r.notes).toBe('Please deliver before 5pm')
    expect(r.orderAt).toBeInstanceOf(Date)
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.updatedAt).toBeInstanceOf(Date)
  })

  it('maps destination address', () => {
    const r = transformOrder(makeOrder())
    expect(r.destinationAddress?.city).toBe('Nashville')
    expect(r.destinationAddress?.name).toBe('Jane Doe')
  })

  it('maps shipmentIds', () => {
    const r = transformOrder(makeOrder())
    expect(r.shipmentIds).toEqual(['AMZ-SHP-001'])
  })

  it('maps line items', () => {
    const r = transformOrder(makeOrder())
    expect(r.lineItems).toHaveLength(1)
    expect(r.lineItems?.[0].sku).toBe('SKU-ABC')
    expect(r.lineItems?.[0].quantity).toBe(2)
    expect(r.lineItems?.[0].unitAmount).toBe(19.99)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformOrder(
      makeOrder({
        displayableOrderId: undefined,
        fulfillmentOrderStatus: null,
        destinationAddress: null,
        shippingSpeedCategory: null,
        displayableOrderComment: null,
        displayableOrderDate: null,
        receivedDate: null,
        statusUpdatedDate: null,
        fulfillmentShipments: [],
        items: [],
      }),
    )
    expect(r.orderNumber).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
    expect(r.requestedServiceCode).toBeUndefined()
    expect(r.shipmentIds).toBeUndefined()
    expect(r.lineItems).toBeUndefined()
    expect(r.orderAt).toBeUndefined()
  })

  it('maps all order statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['RECEIVED', 'PENDING'],
      ['NEW', 'PENDING'],
      ['PLANNING', 'PROCESSING'],
      ['PROCESSING', 'PROCESSING'],
      ['CANCELLED', 'CANCELLED'],
      ['COMPLETE', 'SHIPPED'],
      ['COMPLETE_PARTIALLED', 'SHIPPED'],
      ['INVALID', 'ON_HOLD'],
      ['UNFULFILLABLE', 'ON_HOLD'],
      ['unknown', 'PENDING'],
    ]
    for (const [status, expected] of cases) {
      expect(
        transformOrder(makeOrder({ fulfillmentOrderStatus: status })).status,
      ).toBe(expected)
    }
  })
})
