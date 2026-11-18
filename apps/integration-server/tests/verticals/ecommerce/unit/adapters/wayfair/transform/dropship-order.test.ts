/**
 * Fixtures are the documented examples from the Dropship Orders API (v2)
 * reference, https://developer.wayfair.io/posts/docs/dropship-orders-api/reference/GraphQL/v2.0.0:
 * the SupplierDropshipOrder, PostalAddress, SupplierDropshipLineItem, Money
 * and SupplierDropshipShippingDetails examples, composed as the query nests
 * them.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDropshipOrder,
  type RawWayfairDropshipOrder,
  type RawWayfairPostalAddress,
  type RawWayfairDropshipLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/wayfair/transform/dropship-order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

/** PostalAddress example, verbatim. */
const POSTAL_ADDRESS: RawWayfairPostalAddress = {
  name: 'Dana Sandbox',
  address1: '4 Copley Place',
  address2: 'Apt 6',
  address3: 'xyz789',
  city: 'Boston',
  state: 'MA',
  country: 'USA',
  postalCode: '02116',
  phoneNumber: 'abc123',
  email: 'abc123',
}

/** SupplierDropshipLineItem example, with the Money example in both money fields. */
function line(overrides: Partial<RawWayfairDropshipLineItem> = {}): RawWayfairDropshipLineItem {
  return {
    supplierPartNumber: 'SBX-PART-0001',
    quantity: 2,
    unitPrice: { amount: '64.99', currencyCode: 'USD' },
    status: 'NEW',
    name: 'Sandbox Accent Chair',
    listingId: 'SBX-SKU-1000000101',
    orderValue: { amount: '129.98', currencyCode: 'USD' },
    ...overrides,
  }
}

/** SupplierDropshipOrder example. */
function order(overrides: Partial<RawWayfairDropshipOrder> = {}): RawWayfairDropshipOrder {
  return {
    __typename: 'SupplierDropshipOrder',
    purchaseOrderNumber: 'CS10000001',
    createdAt: '2026-09-11T14:32:00Z',
    customerOrderId: '710000001',
    orderType: 'B2C',
    status: 'NEW',
    mustShipByDate: '2026-09-13T00:00:00Z',
    customer: POSTAL_ADDRESS,
    storeName: 'Wayfair',
    shippingInfo: { shipSpeed: 'SECOND_DAY_AIR', carrierCode: 'FDEG' },
    warehouseDetails: { id: 90001 },
    billingAddress: POSTAL_ADDRESS,
    shippingAddress: POSTAL_ADDRESS,
    lineItems: [line()],
    tasks: [{ taskType: 'PENDING_CANCELLATION', status: 'PENDING_SUPPLIER_REVIEW' }],
    ...overrides,
  }
}

describe('transformDropshipOrder (Wayfair Dropship Orders API v2)', () => {
  it('parses against the canonical OrderSchema', () => {
    expect(() => OrderSchema.parse(transformDropshipOrder(order()))).not.toThrow()
  })

  it('keys the order on purchaseOrderNumber and reads createdAt', () => {
    const o = OrderSchema.parse(transformDropshipOrder(order()))
    expect(o.id).toBe('CS10000001')
    expect(o.orderNumber).toBe('CS10000001')
    expect(o.name).toBe('CS10000001')
    expect(o.createdAt).toBe('2026-09-11T14:32:00.000Z')
  })

  it('maps line items from the documented fields, money in minor units of the stated currency', () => {
    const o = OrderSchema.parse(transformDropshipOrder(order()))
    expect(o.lineItems).toEqual([
      {
        id: 'CS10000001:1',
        sku: 'SBX-PART-0001',
        title: 'Sandbox Accent Chair',
        quantity: 2,
        price: { amount: 6499, currency: 'USD' },
        fulfillmentStatus: 'UNFULFILLED',
        metadata: line(),
      },
    ])
    expect(o.currency).toBe('USD')
  })

  it('takes currency from the Money, never a default', () => {
    const o = OrderSchema.parse(
      transformDropshipOrder(
        order({ lineItems: [line({ unitPrice: { amount: '45.50', currencyCode: 'CAD' } })] }),
      ),
    )
    expect(o.lineItems![0]!.price).toEqual({ amount: 4550, currency: 'CAD' })
    expect(o.currency).toBe('CAD')
  })

  it('publishes no lineItems (and no currency) when a line has no unitPrice', () => {
    const raw = order({ lineItems: [line(), line({ unitPrice: null })] })
    const o = OrderSchema.parse(transformDropshipOrder(raw))
    expect(o.lineItems).toBeUndefined()
    expect(o.currency).toBeUndefined()
    expect(o.metadata['lineItems']).toEqual(raw.lineItems)
  })

  it('treats a blank or non-numeric unitPrice amount as no price, never 0', () => {
    for (const amount of ['', '  ', 'n/a']) {
      const raw = order({ lineItems: [line({ unitPrice: { amount, currencyCode: 'USD' } })] })
      const o = OrderSchema.parse(transformDropshipOrder(raw))
      expect(o.lineItems).toBeUndefined()
      expect(o.currency).toBeUndefined()
    }
  })

  it('publishes no lineItems when a line has no quantity or name', () => {
    expect(
      transformDropshipOrder(order({ lineItems: [line({ quantity: null })] })).lineItems,
    ).toBeUndefined()
    expect(
      transformDropshipOrder(order({ lineItems: [line({ name: null })] })).lineItems,
    ).toBeUndefined()
  })

  it('an order with no lines has an empty lineItems list', () => {
    expect(OrderSchema.parse(transformDropshipOrder(order({ lineItems: [] }))).lineItems).toEqual(
      [],
    )
  })

  it('leaves currency unset when lines disagree', () => {
    const o = transformDropshipOrder(
      order({ lineItems: [line(), line({ unitPrice: { amount: '1.00', currencyCode: 'EUR' } })] }),
    )
    expect(o.lineItems).toHaveLength(2)
    expect(o.currency).toBeUndefined()
  })

  it('maps addresses without the alpha-3 country, and drops an all-null address', () => {
    const o = OrderSchema.parse(
      transformDropshipOrder(
        order({
          billingAddress: {
            name: null,
            address1: null,
            address2: null,
            address3: null,
            city: null,
            state: null,
            country: null,
            postalCode: null,
            phoneNumber: null,
            email: null,
          },
        }),
      ),
    )
    expect(o.shippingAddress).toEqual({
      line1: '4 Copley Place',
      line2: 'Apt 6',
      city: 'Boston',
      region: 'MA',
      postalCode: '02116',
    })
    expect(o.billingAddress).toBeUndefined()
  })

  it('maps customer phone, and email only when it is an email address', () => {
    const doc = OrderSchema.parse(transformDropshipOrder(order()))
    expect(doc.phone).toBe('abc123')
    expect(doc.email).toBeUndefined()
    const real = OrderSchema.parse(
      transformDropshipOrder(order({ customer: { ...POSTAL_ADDRESS, email: 'dana@example.com' } })),
    )
    expect(real.email).toBe('dana@example.com')
  })

  it('maps every documented status to a fulfillment status', () => {
    const cases: Array<[string, string]> = [
      ['NEW', 'UNFULFILLED'],
      ['PROCESSING', 'UNFULFILLED'],
      ['STAGED', 'UNFULFILLED'],
      ['READY_FOR_PICKUP', 'UNFULFILLED'],
      ['PICKED_UP_AWAITING_CARRIER_SCAN', 'FULFILLED'],
      ['IN_TRANSIT_CARRIER_SCAN_RECEIVED', 'FULFILLED'],
      ['DELIVERED', 'FULFILLED'],
      ['CANCELLED', 'unknown'],
      ['RETURNED', 'unknown'],
    ]
    for (const [status, expected] of cases) {
      const o = OrderSchema.parse(
        transformDropshipOrder(order({ status, lineItems: [line({ status })] })),
      )
      expect(o.fulfillmentStatus).toBe(expected)
      expect(o.lineItems![0]!.fulfillmentStatus).toBe(expected)
    }
  })

  it('a null line status leaves the line fulfillmentStatus unset', () => {
    const o = OrderSchema.parse(
      transformDropshipOrder(order({ lineItems: [line({ status: null })] })),
    )
    expect(o.lineItems![0]!.fulfillmentStatus).toBeUndefined()
  })

  it('publishes no financialStatus or totals, which the read does not carry', () => {
    const o = transformDropshipOrder(order())
    expect(o.financialStatus).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.subtotalPrice).toBeUndefined()
  })

  it('keeps the raw order in metadata', () => {
    const raw = order()
    expect(transformDropshipOrder(raw).metadata).toEqual(raw)
  })
})
