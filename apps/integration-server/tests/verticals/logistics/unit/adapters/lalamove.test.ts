import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type LalamoveOrderResponse,
  type LalamoveOrderEvent,
} from '../../../../../src/verticals/logistics/adapters/lalamove/transform/tracking'
import {
  transformShipment,
  type LalamoveOrder,
} from '../../../../../src/verticals/logistics/adapters/lalamove/transform/shipment'
import {
  transformRate,
  type LalamoveQuotation,
} from '../../../../../src/verticals/logistics/adapters/lalamove/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOrderEvent(overrides: Partial<LalamoveOrderEvent> = {}): LalamoveOrderEvent {
  return {
    status: 'ON_GOING',
    description: 'Driver on the way',
    timestamp: '2024-10-05T14:00:00Z',
    driver_name: 'John D.',
    ...overrides,
  }
}

function makeOrderResponse(overrides: Partial<LalamoveOrderResponse> = {}): LalamoveOrderResponse {
  return {
    orderId: 'ORD-LLM-001',
    status: 'ON_GOING',
    events: [
      makeOrderEvent({ status: 'ASSIGNING_DRIVER', description: 'Looking for driver' }),
      makeOrderEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<LalamoveOrder> = {}): LalamoveOrder {
  return {
    orderId: 'ORD-LLM-001',
    status: 'ASSIGNING_DRIVER',
    price_amount: 15.50,
    price_currency: 'SGD',
    driver_name: null,
    pickup_address: '123 Orchard Rd, Singapore',
    delivery_address: '456 Marina Bay, Singapore',
    created_at: '2024-10-05T13:00:00Z',
    updated_at: '2024-10-05T14:00:00Z',
    ...overrides,
  }
}

function makeQuotation(overrides: Partial<LalamoveQuotation> = {}): LalamoveQuotation {
  return {
    quotationId: 'QUO-001',
    service_type: 'MOTORCYCLE',
    total_fee: 12.00,
    currency: 'SGD',
    estimated_duration: 30,
    created_at: '2024-10-05T12:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per order event', () => {
    expect(transformTracking(makeOrderResponse())).toHaveLength(2)
  })

  it('maps order event fields to canonical event', () => {
    const event = transformTracking(makeOrderResponse())[0]

    expect(event.trackingNumber).toBe('ORD-LLM-001')
    expect(event.carrierId).toBe('lalamove')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Looking for driver')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeOrderResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeOrderResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('ORD-LLM-001')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['ASSIGNING_DRIVER', 'PRE_TRANSIT'],
      ['ON_GOING', 'IN_TRANSIT'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['COMPLETED', 'DELIVERED'],
      ['CANCELLED', 'FAILURE'],
      ['EXPIRED', 'FAILURE'],
      ['REJECTED', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOrderResponse({ events: [makeOrderEvent({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeOrder())

    expect(result.id).toBe('ORD-LLM-001')
    expect(result.status).toBe('PENDING')
    expect(result.carrierId).toBe('lalamove')
    expect(result.cost?.amount).toBe(15.50)
    expect(result.cost?.currency).toBe('SGD')
  })

  it('maps origin and destination from addresses', () => {
    const result = transformShipment(makeOrder())
    expect(result.originAddress?.street1).toBe('123 Orchard Rd, Singapore')
    expect(result.destinationAddress?.street1).toBe('456 Marina Bay, Singapore')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeOrder({
      price_amount: null, price_currency: null,
      pickup_address: null, delivery_address: null,
      created_at: null, updated_at: null, status: null,
    })
    const result = transformShipment(raw)
    expect(result.cost).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['ASSIGNING_DRIVER', 'PENDING'],
      ['ON_GOING', 'IN_TRANSIT'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['COMPLETED', 'DELIVERED'],
      ['CANCELLED', 'CANCELLED'],
      ['EXPIRED', 'EXCEPTION'],
      ['REJECTED', 'EXCEPTION'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeOrder({ status })).status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeQuotation())

    expect(result.id).toBe('QUO-001')
    expect(result.carrierId).toBe('lalamove')
    expect(result.serviceCode).toBe('MOTORCYCLE')
    expect(result.currency).toBe('SGD')
    expect(result.totalAmount).toBe(12.00)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeQuotation()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeQuotation({
      quotationId: null, service_type: null,
      total_fee: null, currency: null,
      estimated_duration: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('USD')
  })
})
