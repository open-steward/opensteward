/**
 * Fixtures: the first item of the documented 200 example of
 * GET /orders/customerOrders, and the `coLines` of the documented example of
 * GET /orders/customerOrders/{orderId}
 * (https://auth.deposco.com/public/spec?version=latest).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type DeposcoCustomerOrder,
} from '../../../../../../../src/verticals/logistics/adapters/deposco/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

const DOCUMENTED_ORDER: DeposcoCustomerOrder = {
  self: { id: 67890 },
  businessUnit: { id: 100, businessKey: { code: 'ABC' } },
  number: 'CO-2024-001234',
  status: 'Open',
  externalOrderNumber: 'CO123',
  tradingPartner: {
    id: 201,
    businessKey: { code: 'Generic Ecomm Partner', 'businessUnit.code': 'ABC' },
  },
  orderType: 'Standard',
  deliveryType: 'ShipToCustomer',
  placedDate: '2019-08-24T14:15:22Z',
  accountNumber: 'cust123',
  shipToContact: {
    firstName: 'John',
    lastName: 'Doe',
    phone: '123-456-7890',
    email: 'john@example.com',
    line1: '123 Test Street',
    city: 'Alpharetta',
    stateProvince: 'GA',
    postalCode: '30009',
    country: 'US',
  },
  total: 10,
  subTotal: 8,
  shippingTotal: 1.5,
  taxTotal: 1,
  currencyCode: 'USD',
  shipVia: 'UPS Ground',
  shipVendor: 'UPS',
  createdDate: '2019-08-24T14:15:22Z',
  updatedDate: '2019-08-25T09:30:15Z',
}

const DOCUMENTED_LINES = {
  data: [
    {
      self: { id: 12345 },
      itemNumber: 'S456',
      description: 'Premium Widget - Blue',
      orderQuantity: 1,
    },
  ],
}

describe('deposco transformOrder (documented example)', () => {
  const out = transformOrder(DOCUMENTED_ORDER)

  it('parses with the canonical OrderSchema', () => {
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('takes the id from self.id, the {orderId} of GET /orders/customerOrders/{orderId}', () => {
    expect(out.id).toBe('67890')
    expect(out.orderNumber).toBe('CO-2024-001234')
  })

  it('maps Open to PENDING', () => {
    expect(out.status).toBe('PENDING')
  })

  it('maps the ship-to contact', () => {
    expect(out.destinationAddress).toEqual({
      name: 'John Doe',
      street1: '123 Test Street',
      city: 'Alpharetta',
      state: 'GA',
      postalCode: '30009',
      country: 'US',
      phone: '123-456-7890',
      email: 'john@example.com',
    })
    expect(out.originAddress).toBeUndefined()
  })

  it('maps shipVia and dates', () => {
    expect(out.requestedServiceCode).toBe('UPS Ground')
    expect(out.orderAt?.toISOString()).toBe('2019-08-24T14:15:22.000Z')
    expect(out.createdAt?.toISOString()).toBe('2019-08-24T14:15:22.000Z')
    expect(out.updatedAt?.toISOString()).toBe('2019-08-25T09:30:15.000Z')
  })

  it('does not put major-unit decimals into the minor-unit amount fields', () => {
    expect(out.totalAmount).toBeUndefined()
    expect(out.subtotalAmount).toBeUndefined()
    expect(out.shippingAmount).toBeUndefined()
    expect(out.taxAmount).toBeUndefined()
    expect(out.currency).toBeUndefined()
    expect(out.metadata?.total).toBe(10)
  })

  it('maps documented order lines', () => {
    const withLines = transformOrder({ ...DOCUMENTED_ORDER, coLines: DOCUMENTED_LINES })
    expect(withLines.lineItems).toEqual([
      { id: '12345', sku: 'S456', description: 'Premium Widget - Blue', quantity: 1 },
    ])
    expect(() => OrderSchema.parse(withLines)).not.toThrow()
  })

  it('omits a fractional quantity rather than rounding it', () => {
    const out2 = transformOrder({
      ...DOCUMENTED_ORDER,
      coLines: { data: [{ itemNumber: 'S1', orderQuantity: 1.5 }] },
    })
    expect(out2.lineItems?.[0]?.quantity).toBeUndefined()
    expect(() => OrderSchema.parse(out2)).not.toThrow()
  })
})

describe('deposco transformOrder status (documented enum)', () => {
  it.each([
    ['New', 'PENDING'],
    ['Draft', 'PENDING'],
    ['Allocated', 'PROCESSING'],
    ['InFulfillment', 'PROCESSING'],
    ['Released', 'PROCESSING'],
    ['Back Ordered', 'ON_HOLD'],
    ['Canceled', 'CANCELLED'],
    ['Voided', 'CANCELLED'],
    ['Rejected', 'CANCELLED'],
    ['Complete', 'unknown'],
    ['Closed', 'unknown'],
  ])('%s -> %s', (status, expected) => {
    const out = transformOrder({ ...DOCUMENTED_ORDER, status })
    expect(out.status).toBe(expected)
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })
})

describe('deposco transformOrder: documented fields that are only sometimes present', () => {
  it('maps shipFromContact ("Name and address information for the person or company from which the order ships.") to originAddress', () => {
    const out = transformOrder({
      ...DOCUMENTED_ORDER,
      shipFromContact: {
        firstName: 'Jane',
        lastName: 'Roe',
        line1: '124 Test Street',
        city: 'Alpharetta',
        stateProvince: 'GA',
        postalCode: '30009',
        country: 'US',
      },
    })
    expect(out.originAddress).toEqual({
      name: 'Jane Roe',
      street1: '124 Test Street',
      city: 'Alpharetta',
      state: 'GA',
      postalCode: '30009',
      country: 'US',
    })
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('leaves lineItems unset when the order carries no coLines', () => {
    expect(transformOrder(DOCUMENTED_ORDER).lineItems).toBeUndefined()
    expect(transformOrder({ ...DOCUMENTED_ORDER, coLines: { data: [] } }).lineItems).toBeUndefined()
  })
})
