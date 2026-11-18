import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type AimeosService,
} from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/fulfillment'
import type { AimeosOrder } from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDeliveryService(
  overrides: Partial<AimeosService['attributes']> = {},
): AimeosService {
  return {
    type: 'order/base/service',
    id: 'svc-001',
    attributes: {
      'order.base.service.type': 'delivery',
      'order.base.service.code': 'dhl-express',
      'order.base.service.name': 'DHL Express',
      'order.base.service.attribute': [
        { code: 'tracking-code', value: 'DHL123456789DE' },
        { code: 'tracking-url', value: 'https://dhl.com/track/DHL123456789DE' },
      ],
      'order.base.service.ctime': '2024-06-01T00:00:00+00:00',
      'order.base.service.mtime': '2024-06-02T00:00:00+00:00',
      ...overrides,
    },
  }
}

function makeOrder(
  statusDelivery: number = 3,
  overrides: Partial<AimeosOrder['attributes']> = {},
): AimeosOrder {
  return {
    type: 'order',
    id: 'order-001',
    attributes: {
      'order.id': 'order-001',
      'order.baseid': 'base-001',
      'order.statusdelivery': statusDelivery,
      'order.statuspayment': 6,
      'order.ctime': '2024-06-01T00:00:00+00:00',
      'order.mtime': '2024-06-02T00:00:00+00:00',
      ...overrides,
    },
  }
}

// ── transformFulfillment ──────────────────────────────────────────────────────

describe('transformFulfillment (Aimeos)', () => {
  it('maps core fulfillment fields from order', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('order-001')
    expect(result.orderId).toBe('order-001')
    expect(result.createdAt).toBe('2024-06-01T00:00:00+00:00')
    expect(result.updatedAt).toBe('2024-06-02T00:00:00+00:00')
  })

  it('maps delivery status 4 (delivered) to SUCCESS', () => {
    const result = transformFulfillment(makeOrder(4))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps delivery status 3 (dispatch) to OPEN', () => {
    const result = transformFulfillment(makeOrder(3))
    expect(result.status).toBe('OPEN')
  })

  it('maps delivery status 2 (progress) to OPEN', () => {
    const result = transformFulfillment(makeOrder(2))
    expect(result.status).toBe('OPEN')
  })

  it('maps delivery status 1 (waiting) to PENDING', () => {
    const result = transformFulfillment(makeOrder(1))
    expect(result.status).toBe('PENDING')
  })

  it('maps delivery status 0 (unfinished) to PENDING', () => {
    const result = transformFulfillment(makeOrder(0))
    expect(result.status).toBe('PENDING')
  })

  it('maps delivery status 5 (lost) to FAILURE', () => {
    const result = transformFulfillment(makeOrder(5))
    expect(result.status).toBe('FAILURE')
  })

  it('maps delivery status -1 (deleted) to CANCELLED', () => {
    const result = transformFulfillment(makeOrder(-1))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps delivery status 6 (refused) to CANCELLED', () => {
    const result = transformFulfillment(makeOrder(6))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking number from delivery service attributes', () => {
    const result = transformFulfillment(makeOrder(), makeDeliveryService())
    expect(result.trackingNumber).toBe('DHL123456789DE')
  })

  it('maps carrier name from delivery service', () => {
    const result = transformFulfillment(makeOrder(), makeDeliveryService())
    expect(result.carrier).toBe('DHL Express')
  })

  it('maps service code from delivery service', () => {
    const result = transformFulfillment(makeOrder(), makeDeliveryService())
    expect(result.service).toBe('dhl-express')
  })

  it('returns no tracking number when no delivery service provided', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrier).toBeUndefined()
  })

  it('handles service with no tracking-code attribute', () => {
    const svc = makeDeliveryService({
      'order.base.service.attribute': [{ code: 'other-attr', value: 'value' }],
    })
    const result = transformFulfillment(makeOrder(), svc)
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles service with non-array attribute', () => {
    const svc = makeDeliveryService({
      'order.base.service.attribute': null,
    })
    const result = transformFulfillment(makeOrder(), svc)
    expect(result.trackingNumber).toBeUndefined()
  })

  it('sets shippedAt for orders in dispatch or later status', () => {
    const result = transformFulfillment(makeOrder(3))
    expect(result.shippedAt).toBe('2024-06-02T00:00:00+00:00')
  })

  it('does not set shippedAt for pre-dispatch orders', () => {
    const result = transformFulfillment(makeOrder(1))
    expect(result.shippedAt).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder(), makeDeliveryService())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
