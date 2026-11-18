import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type DrupalShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<DrupalShipment['attributes']> = {}): DrupalShipment {
  return {
    type: 'commerce_shipment--default',
    id: 'ship-uuid-001',
    attributes: {
      title: 'Shipment #1',
      state: 'shipped',
      tracking_code: '1Z999AA10123456784',
      amount: { number: '9.99', currency_code: 'USD' },
      changed: 1717300000,
      shipped_time: 1717250000,
      ...overrides,
    },
    relationships: {
      order_id: {
        data: { type: 'commerce_order--default', id: 'order-uuid-001' },
      },
      shipping_method: {
        data: { type: 'commerce_shipping_method--default', id: 'method-uuid-001' },
      },
      store_id: {
        data: { type: 'commerce_store--online', id: 'store-uuid-001' },
      },
    },
  }
}

// ── transformFulfillment ──────────────────────────────────────────────────────

describe('transformFulfillment (Drupal Commerce)', () => {
  it('maps core shipment fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('ship-uuid-001')
    expect(result.orderId).toBe('order-uuid-001')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps shipped state to SUCCESS status', () => {
    const result = transformFulfillment(makeShipment({ state: 'shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps draft state to PENDING status', () => {
    const result = transformFulfillment(makeShipment({ state: 'draft' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps ready state to OPEN status', () => {
    const result = transformFulfillment(makeShipment({ state: 'ready' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps canceled state to CANCELLED status', () => {
    const result = transformFulfillment(makeShipment({ state: 'canceled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown state to PENDING', () => {
    const result = transformFulfillment(makeShipment({ state: 'unknown_state' }))
    expect(result.status).toBe('PENDING')
  })

  it('handles missing state gracefully', () => {
    const result = transformFulfillment(makeShipment({ state: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('converts shipped_time unix timestamp to ISO string', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.shippedAt).toBe('2024-06-01T13:53:20.000Z')
  })

  it('converts changed unix timestamp to ISO string for updatedAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.updatedAt).toBe('2024-06-02T03:46:40.000Z')
  })

  it('maps shipping_method relationship id as carrier', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('method-uuid-001')
  })

  it('maps store_id relationship as locationId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.locationId).toBe('store-uuid-001')
  })

  it('handles missing tracking_code', () => {
    const result = transformFulfillment(makeShipment({ tracking_code: null }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles missing shipped_time', () => {
    const result = transformFulfillment(makeShipment({ shipped_time: null }))
    expect(result.shippedAt).toBeUndefined()
  })

  it('handles missing order_id relationship', () => {
    const raw: DrupalShipment = { ...makeShipment(), relationships: {} }
    const result = transformFulfillment(raw)
    expect(result.orderId).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

// ── untransformFulfillment ────────────────────────────────────────────────────

describe('untransformFulfillment (Drupal Commerce)', () => {
  it('produces JSON:API body with correct type', () => {
    const body = untransformFulfillment({ trackingNumber: '9400111899223493107600' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('commerce_shipment--default')
    expect(body.data.attributes['tracking_code']).toBe('9400111899223493107600')
  })

  it('omits tracking_code when not provided', () => {
    const body = untransformFulfillment({}) as {
      data: { attributes: Record<string, unknown> }
    }
    expect(body.data.attributes['tracking_code']).toBeUndefined()
  })
})
