import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawJoorOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/joor/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (joor)', () => {
  const raw: RawJoorOrder = {
    id: 'joor-ord-9000',
    status: 'APPROVED',
    customer: { id: 'cust-1', code: 'C001', name: 'Acme Retailer', email: 'buyer@acme.example' },
    total: 250.0,
    date_created: '2024-03-01T00:00:00.000Z',
    date_modified: '2024-03-01T00:00:00.000Z',
    date_approved: '2024-03-01T00:00:00.000Z',
    billing_address: {
      address_1: '100 Trade St',
      city: 'New York',
      zip: '10001',
      country_code: 'US',
    },
    shipping_address: {
      address_1: '200 Market Ave',
      city: 'Los Angeles',
      zip: '90001',
      country_code: 'US',
    },
    comments: 'Ship by end of quarter',
  }

  it('maps id directly', () => {
    const result = transformOrder(raw)
    expect(result.id).toBe('joor-ord-9000')
  })

  it('maps APPROVED status → PAID / UNFULFILLED', () => {
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps total to minor units (USD × 100)', () => {
    const result = transformOrder(raw)
    // 250.00 → 25000 cents
    expect(result.totalPrice).toEqual({ amount: 25000, currency: 'USD' })
  })

  it('maps customerId from customer.id', () => {
    const result = transformOrder(raw)
    expect(result.customerId).toBe('cust-1')
  })

  it('maps note from comments', () => {
    const result = transformOrder(raw)
    expect(result.note).toBe('Ship by end of quarter')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(raw)
    expect(result.billingAddress?.line1).toBe('100 Trade St')
    expect(result.billingAddress?.country).toBe('US')
    expect(result.shippingAddress?.city).toBe('Los Angeles')
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps SHIPPED status → PAID / FULFILLED', () => {
    const result = transformOrder({ ...raw, status: 'SHIPPED' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps CANCELLED status → VOIDED / RESTOCKED', () => {
    const result = transformOrder({ ...raw, status: 'CANCELLED' })
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('round-trips via untransformOrder', () => {
    const result = transformOrder(raw)
    const back = untransformOrder(result)
    // APPROVED maps back to APPROVED
    expect(back.status).toBe('APPROVED')
    expect(back.comments).toBe(raw.comments)
  })
})
