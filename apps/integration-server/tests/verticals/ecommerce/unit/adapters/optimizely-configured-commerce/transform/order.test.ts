/**
 * Optimizely Configured Commerce `transformOrder` / `untransformOrder` —
 * maps the Storefront v1 OrderModel (returned bare by `GET
 * /api/v1/orders/{id}`) to/from the canonical Order shape. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/ordersv1_getasync
 * https://docs.developers.optimizely.com/configured-commerce/reference/ordersv1_patchasync
 */
import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import {
  transformOrder,
  untransformOrder,
  type RawOptimizelyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/transform/order'

describe('Optimizely transformOrder', () => {
  it('produces output that satisfies the canonical Order schema', () => {
    const out = transformOrder({
      id: 'o1',
      webOrderNumber: '1042',
      orderDate: '2026-01-15T09:30:00Z',
      modifyDate: '2026-02-01T14:20:00Z',
      currencyCode: 'USD',
      orderTotal: 99.99,
      taxAmount: 5.5,
      notes: 'Leave at front desk.',
      btAddress1: '1 Main St',
      billToCity: 'Boston',
    })
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    expect(() => OrderSchema.parse(transformOrder({ id: 'min' }))).not.toThrow()
  })

  it('maps id/orderNumber/name from id and webOrderNumber', () => {
    const out = transformOrder({ id: 'o1', webOrderNumber: '1042' })
    expect(out.id).toBe('o1')
    expect(out.orderNumber).toBe('1042')
    expect(out.name).toBe('1042')
  })

  it('falls back to erpOrderNumber when webOrderNumber is absent', () => {
    expect(transformOrder({ id: 'o2', erpOrderNumber: 'ERP-9' }).orderNumber).toBe('ERP-9')
  })

  it('converts major-unit decimal totals to integer minor units using currencyCode', () => {
    const out = transformOrder({ id: 'o3', currencyCode: 'USD', orderTotal: 19.99 })
    expect(out.totalPrice).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('leaves money fields unset when currencyCode is missing or malformed', () => {
    expect(transformOrder({ id: 'o4', orderTotal: 19.99 }).totalPrice).toBeUndefined()
    expect(transformOrder({ id: 'o5', currencyCode: 'usd', orderTotal: 1 }).totalPrice).toBeUndefined()
  })

  it('only sets billingAddress/shippingAddress when at least one field is present', () => {
    expect(transformOrder({ id: 'o6' }).billingAddress).toBeUndefined()
    expect(transformOrder({ id: 'o7' }).shippingAddress).toBeUndefined()
    expect(transformOrder({ id: 'o8', billToCity: 'Boston' }).billingAddress).toEqual(
      expect.objectContaining({ city: 'Boston' }),
    )
  })

  it('maps the confirmed mixed bt/billTo and st/shipTo address field names', () => {
    const out = transformOrder({
      id: 'o10',
      btAddress1: '1 Main St',
      btAddress2: 'Suite 2',
      billToCity: 'Boston',
      billToState: 'MA',
      billToPostalCode: '02101',
      stAddress1: '2 Side St',
      shipToCity: 'Cambridge',
      shipToState: 'MA',
      shipToPostalCode: '02138',
    })
    expect(out.billingAddress).toEqual({
      line1: '1 Main St',
      line2: 'Suite 2',
      city: 'Boston',
      region: 'MA',
      postalCode: '02101',
    })
    expect(out.shippingAddress).toEqual({
      line1: '2 Side St',
      line2: undefined,
      city: 'Cambridge',
      region: 'MA',
      postalCode: '02138',
    })
  })

  it('never maps btCountry/stCountry onto address.country (format unconfirmed)', () => {
    const out = transformOrder({ id: 'o11', btCountry: 'US', stCountry: 'US' })
    expect(out.billingAddress?.country).toBeUndefined()
    expect(out.shippingAddress?.country).toBeUndefined()
  })

  it('does not map a customerId — OrderModel has no customer/account foreign key', () => {
    expect(transformOrder({ id: 'o12', customerNumber: 'CUST-1' } as RawOptimizelyOrder).customerId).toBeUndefined()
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawOptimizelyOrder = { id: 'o9' }
    expect(transformOrder(raw).metadata).toBe(raw)
  })
})

describe('Optimizely untransformOrder', () => {
  it('maps note to notes', () => {
    expect(untransformOrder({ note: 'hello' })).toEqual({ notes: 'hello' })
  })

  it('converts Money fields back to major-unit decimals using their own currency', () => {
    const body = untransformOrder({ totalTax: { amount: 550, currency: 'USD' } })
    expect(body['taxAmount']).toBe(5.5)
  })

  it('omits fields that were not provided', () => {
    expect(untransformOrder({})).toEqual({})
  })
})
