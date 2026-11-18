import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type QuiqupOrder,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<QuiqupOrder> = {}): QuiqupOrder {
  return {
    id: 'ord-qq-001',
    reference: 'REF-001',
    external_reference: 'EXT-001',
    status: 'shipped',
    pickup_address: {
      name: 'Sender',
      address_line_1: '1 Sender St',
      city: 'Dubai',
      country_code: 'AE',
    },
    delivery_address: {
      name: 'Recipient',
      address_line_1: '2 Recv Ave',
      city: 'Abu Dhabi',
      country_code: 'AE',
    },
    job_ids: ['job-001', 'job-002'],
    currency: 'AED',
    subtotal_amount: 50.0,
    tax_amount: 5.0,
    shipping_amount: 10.0,
    discount_amount: 0,
    total_amount: 65.0,
    notes: 'Handle with care',
    service_type: 'SAME_DAY',
    ordered_at: '2024-03-01T00:00:00Z',
    shipped_at: '2024-03-01T08:00:00Z',
    delivered_at: null,
    cancelled_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformOrder ───────────────────────────────────────────────────────────

describe('Quiqup transformOrder', () => {
  it('maps id and status', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('ord-qq-001')
    expect(result.status).toBe('SHIPPED')
  })

  it('prefers reference over external_reference for orderNumber', () => {
    const result = transformOrder(makeRaw())
    expect(result.orderNumber).toBe('REF-001')
  })

  it('falls back to external_reference when reference is absent', () => {
    const result = transformOrder(makeRaw({ reference: null }))
    expect(result.orderNumber).toBe('EXT-001')
  })

  it('maps financial fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('AED')
    expect(result.subtotalAmount).toBe(50.0)
    expect(result.taxAmount).toBe(5.0)
    expect(result.shippingAmount).toBe(10.0)
    expect(result.discountAmount).toBe(0)
    expect(result.totalAmount).toBe(65.0)
  })

  it('maps addresses', () => {
    const result = transformOrder(makeRaw())
    expect(result.originAddress?.city).toBe('Dubai')
    expect(result.destinationAddress?.city).toBe('Abu Dhabi')
  })

  it('maps job_ids to shipmentIds', () => {
    const result = transformOrder(makeRaw())
    expect(result.shipmentIds).toEqual(['job-001', 'job-002'])
  })

  it('maps service_type to requestedServiceCode', () => {
    const result = transformOrder(makeRaw())
    expect(result.requestedServiceCode).toBe('SAME_DAY')
  })

  it('parses date fields to Date instances', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.orderAt).toBeInstanceOf(Date)
    expect(result.shippedAt).toBeInstanceOf(Date)
  })

  it('maps all status values correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['created', 'PENDING'],
      ['processing', 'PROCESSING'],
      ['accepted', 'PROCESSING'],
      ['on_hold', 'ON_HOLD'],
      ['awaiting_shipment', 'AWAITING_SHIPMENT'],
      ['ready_for_collection', 'AWAITING_SHIPMENT'],
      ['shipped', 'SHIPPED'],
      ['in_transit', 'SHIPPED'],
      ['collected', 'SHIPPED'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'CANCELLED'],
      ['canceled', 'CANCELLED'],
      ['returned', 'RETURNED'],
      ['return_to_sender', 'RETURNED'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformOrder(makeRaw({ status })).status).toBe(expected)
    }
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})
