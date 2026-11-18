import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawKauflandOrderUnitForFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeUnit(
  overrides: Partial<RawKauflandOrderUnitForFulfillment> = {},
): RawKauflandOrderUnitForFulfillment {
  return {
    id_order_unit: 7001,
    id_order: 'ORD-123',
    status: 'sent',
    tracking_numbers: 'TRK001,TRK002',
    carrier_code: 'DHL',
    ts_created_iso: '2024-03-01T00:00:00Z',
    ts_updated_iso: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (kaufland-marketplace)', () => {
  it('maps id_order_unit to string id', () => {
    const result = transformFulfillment(makeUnit({ id_order_unit: 999 }))
    expect(result.id).toBe('999')
  })

  it('maps id_order to orderId', () => {
    const result = transformFulfillment(makeUnit())
    expect(result.orderId).toBe('ORD-123')
  })

  it('falls back to id_order_unit for orderId when id_order is null', () => {
    const result = transformFulfillment(makeUnit({ id_order: null }))
    expect(result.orderId).toBe('7001')
  })

  it('maps sent status to SUCCESS', () => {
    const result = transformFulfillment(makeUnit({ status: 'sent' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps need_to_be_sent status to OPEN', () => {
    const result = transformFulfillment(makeUnit({ status: 'need_to_be_sent' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformFulfillment(makeUnit({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps returned status to CANCELLED', () => {
    const result = transformFulfillment(makeUnit({ status: 'returned' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('extracts first tracking number from comma-separated list', () => {
    const result = transformFulfillment(makeUnit({ tracking_numbers: 'TRK001,TRK002' }))
    expect(result.trackingNumber).toBe('TRK001')
  })

  it('maps carrier_code to carrier', () => {
    const result = transformFulfillment(makeUnit({ carrier_code: 'HERMES' }))
    expect(result.carrier).toBe('HERMES')
  })

  it('synthesises lineItems with one entry using id_order_unit', () => {
    const result = transformFulfillment(makeUnit({ id_order_unit: 7001 }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.lineItemId).toBe('7001')
    expect(result.lineItems?.[0]?.quantity).toBe(1)
  })

  it('maps ts_created_iso to createdAt', () => {
    const result = transformFulfillment(makeUnit())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps ts_updated_iso to updatedAt', () => {
    const result = transformFulfillment(makeUnit())
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeUnit()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeUnit())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (kaufland-marketplace)', () => {
  it('maps trackingNumber to tracking_numbers', () => {
    const body = untransformFulfillment({ trackingNumber: 'TRK123' })
    expect(body.tracking_numbers).toBe('TRK123')
  })

  it('maps carrier to carrier_code', () => {
    const body = untransformFulfillment({ carrier: 'DHL' })
    expect(body.carrier_code).toBe('DHL')
  })

  it('round-trips tracking and carrier', () => {
    const canonical = transformFulfillment(makeUnit())
    const body = untransformFulfillment(canonical)
    expect(body.tracking_numbers).toBe('TRK001')
    expect(body.carrier_code).toBe('DHL')
  })
})
