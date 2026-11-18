import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawJumpsellerOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (jumpseller)', () => {
  const raw: RawJumpsellerOrder = {
    id: 8000,
    status: 'Paid',
    total: 119.98,
    subtotal: 99.99,
    shipping_total: 9.99,
    tax: 10.0,
    discount: 0,
    currency: 'CLP',
    customer: { id: 555, email: 'sofia@example.cl', phone: '+56912345678' },
    billing_address: {
      address: 'Av. Providencia',
      street_number: '1234',
      city: 'Santiago',
      postal: '7500000',
      country_code: 'CL',
    },
    shipping_address: {
      address: 'Las Condes',
      city: 'Las Condes',
      country_code: 'CL',
    },
    products: [
      {
        id: 10,
        variant_id: 20,
        name: 'Chaqueta Outdoor',
        qty: 1,
        price: 99.99,
        sku: 'CO-L-RED',
      },
    ],
    coupon_code: 'BIENVENIDO',
    additional_information: 'Entregar en portería',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformOrder(raw)
    expect(result.id).toBe('8000')
  })

  it('maps Paid status → PAID / UNFULFILLED', () => {
    const result = transformOrder(raw)
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Shipped status → PAID / FULFILLED', () => {
    const result = transformOrder({ ...raw, status: 'Shipped' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts total to minor units (CLP = 0 decimal places → ×1)', () => {
    const result = transformOrder(raw)
    // CLP has 0 decimal places, so 119.98 → Math.round(119.98 * 1) = 120
    expect(result.totalPrice).toEqual({ amount: 120, currency: 'CLP' })
  })

  it('maps customerId from customer.id', () => {
    const result = transformOrder(raw)
    expect(result.customerId).toBe('555')
  })

  it('maps email from customer.email', () => {
    const result = transformOrder(raw)
    expect(result.email).toBe('sofia@example.cl')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(raw)
    expect(result.billingAddress?.line1).toBe('Av. Providencia 1234')
    expect(result.billingAddress?.country).toBe('CL')
    expect(result.shippingAddress?.city).toBe('Las Condes')
  })

  it('maps line items', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Chaqueta Outdoor')
    expect(result.lineItems![0]!.variantId).toBe('20')
    expect(result.lineItems![0]!.sku).toBe('CO-L-RED')
  })

  it('maps coupon_code to discountCodes array', () => {
    const result = transformOrder(raw)
    expect(result.discountCodes).toEqual(['BIENVENIDO'])
  })

  it('maps note from additional_information', () => {
    const result = transformOrder(raw)
    expect(result.note).toBe('Entregar en portería')
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps Canceled status → VOIDED / UNFULFILLED', () => {
    const result = transformOrder({ ...raw, status: 'Canceled' })
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('round-trips via untransformOrder', () => {
    const result = transformOrder(raw)
    const back = untransformOrder(result)
    expect(back.status).toBe('Paid')
    expect(back.coupon_code).toBe('BIENVENIDO')
    expect(back.additional_information).toBe('Entregar en portería')
  })
})
