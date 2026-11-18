import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type CHROrderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/ch-robinson/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<CHROrderResponse> = {}): CHROrderResponse {
  return {
    orderId: 'ORD-001',
    orderNumber: 'CHR-ORD-001',
    status: 'AWAITING_SHIPMENT',
    customerId: 'CUST-001',
    warehouseId: 'WH-001',
    currency: 'USD',
    totalAmount: 15000,
    shippingAmount: 1200,
    notes: 'Priority order',
    requestedServiceCode: 'LTL_STD',
    orderAt: '2024-03-01T00:00:00Z',
    shippedAt: '2024-03-02T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('ch-robinson transformOrder', () => {
  it('maps orderId to id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ORD-001')
  })

  it('maps orderNumber to orderNumber', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('CHR-ORD-001')
  })

  it('maps AWAITING_SHIPMENT status', () => {
    expect(transformOrder(makeRaw()).status).toBe('AWAITING_SHIPMENT')
  })

  it('maps customerId to customerId', () => {
    expect(transformOrder(makeRaw()).customerId).toBe('CUST-001')
  })

  it('maps warehouseId to warehouseId', () => {
    expect(transformOrder(makeRaw()).warehouseId).toBe('WH-001')
  })

  it('maps currency to currency', () => {
    expect(transformOrder(makeRaw()).currency).toBe('USD')
  })

  it('maps totalAmount to totalAmount', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(15000)
  })

  it('maps shippingAmount to shippingAmount', () => {
    expect(transformOrder(makeRaw()).shippingAmount).toBe(1200)
  })

  it('maps notes to notes', () => {
    expect(transformOrder(makeRaw()).notes).toBe('Priority order')
  })

  it('maps requestedServiceCode to requestedServiceCode', () => {
    expect(transformOrder(makeRaw()).requestedServiceCode).toBe('LTL_STD')
  })

  it('maps orderAt to orderAt as Date', () => {
    expect(transformOrder(makeRaw()).orderAt).toBeInstanceOf(Date)
  })

  it('maps shippedAt to shippedAt as Date', () => {
    expect(transformOrder(makeRaw()).shippedAt).toBeInstanceOf(Date)
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING status', () => {
    expect(transformOrder(makeRaw({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('maps DELIVERED status', () => {
    expect(transformOrder(makeRaw({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps CANCELLED status (alternate spelling CANCELED)', () => {
    expect(transformOrder(makeRaw({ status: 'CANCELED' })).status).toBe('CANCELLED')
  })

  it('returns undefined status for unknown status string', () => {
    expect(transformOrder(makeRaw({ status: 'UNKNOWN_STATUS' })).status).toBeUndefined()
  })

  it('handles missing optional fields', () => {
    const result = transformOrder({})
    expect(result.id).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
