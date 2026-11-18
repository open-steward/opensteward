/**
 * GOFRUGAL Sales Order transform tests.
 *
 * Raw shape per the documented create/retrieve sales order examples on
 * https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/create-a-sales-order
 * and .../articles/retrieve-a-sales-order.
 *
 * GOFRUGAL reports no currency of its own — `currency` is always the
 * caller-supplied, connection-level value (see ../client.ts), so these
 * tests deliberately use a non-INR currency (AED) to pin that nothing here
 * is hardcoded to India.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawGofrugalSalesOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/gofrugal/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawGofrugalSalesOrder> = {}): RawGofrugalSalesOrder {
  return {
    onlineReferenceNo: 1,
    createdAt: '2013-11-22 13:00:00',
    updatedAt: '2013-11-22 13:00:00',
    status: 'pending',
    orderRemarks: '',
    totalQuantity: 10,
    totalAmount: 100,
    totalTaxAmount: 2,
    totalDiscountAmount: 0,
    shippingId: '1',
    shippingName: 'Test Customer',
    shippingAddress1: '1 Example Street',
    shippingPlace: 'chennai',
    shippingState: 'Tamil Nadu',
    shippingCountry: 'india',
    shippingPincode: 600042,
    shippingMobile: '9000000000',
    shippingEmail: 'customer@example.com',
    deliveryDate: '2013-11-22 13:00:00',
    locationId: 1,
    orderItems: [
      {
        rowNo: 1,
        itemId: 1,
        itemName: 'lux',
        itemReferenceCode: 'LUX-001',
        salePrice: 10,
        quantity: 10,
        itemAmount: 100,
        taxPercentage: 2,
        discountPercentage: 0,
      },
    ],
    customerId: 1,
    customerName: 'Test Customer',
    customerAddressLine1: 'chennai',
    customerCity: 'chennai',
    customerState: 'tamil nadu',
    customerCountry: 'india',
    customerPincode: 600042,
    customerEmail: 'customer@example.com',
    customerMobile: '9000000000',
    ...overrides,
  }
}

describe('GOFRUGAL transform/order', () => {
  it('maps a full sales order and survives OrderSchema.parse', () => {
    const order = transformOrder(makeOrder(), 'AED')
    expect(OrderSchema.parse(order)).toBeTruthy()
    expect(order.id).toBe('1')
    expect(order.customerId).toBe('1')
    expect(order.email).toBe('customer@example.com')
    expect(order.currency).toBe('AED')
  })

  it('uses whatever currency the connection reports, e.g. INR for an Indian deployment', () => {
    const order = transformOrder(makeOrder(), 'INR')
    expect(order.currency).toBe('INR')
    expect(order.totalPrice).toEqual({ amount: 10000, currency: 'INR' })
  })

  it('converts decimal totals to integer minor units', () => {
    const order = transformOrder(makeOrder({ totalAmount: 100, totalTaxAmount: 2 }), 'AED')
    OrderSchema.parse(order)
    expect(order.totalPrice).toEqual({ amount: 10000, currency: 'AED' })
    expect(order.totalTax).toEqual({ amount: 200, currency: 'AED' })
  })

  it('maps the documented "pending" status to PENDING, and anything else to unknown', () => {
    expect(transformOrder(makeOrder({ status: 'pending' }), 'AED').financialStatus).toBe('PENDING')
    const other = transformOrder(makeOrder({ status: 'shipped' }), 'AED')
    expect(OrderSchema.parse(other)).toBeTruthy()
    expect(other.financialStatus).toBe('unknown')
  })

  it('maps order items to line items with a unit price in minor units', () => {
    const order = transformOrder(makeOrder(), 'AED')
    OrderSchema.parse(order)
    expect(order.lineItems).toHaveLength(1)
    expect(order.lineItems![0]).toMatchObject({
      productId: '1',
      title: 'lux',
      quantity: 10,
      price: { amount: 1000, currency: 'AED' },
    })
  })

  it('normalises the documented lowercase country name to an ISO alpha-2 code', () => {
    const order = transformOrder(makeOrder(), 'AED')
    OrderSchema.parse(order)
    expect(order.shippingAddress?.country).toBe('IN')
    expect(order.billingAddress?.country).toBe('IN')
  })

  it('drops an unrecognised country rather than failing the transform', () => {
    const order = transformOrder(makeOrder({ shippingCountry: 'Wakanda' }), 'AED')
    expect(() => OrderSchema.parse(order)).not.toThrow()
    expect(order.shippingAddress?.country).toBeUndefined()
  })

  it('leaves country unset — never defaulted to India — when none is reported', () => {
    const order = transformOrder(
      makeOrder({ shippingCountry: undefined, customerCountry: undefined }),
      'AED',
    )
    expect(() => OrderSchema.parse(order)).not.toThrow()
    expect(order.shippingAddress?.country).toBeUndefined()
    expect(order.billingAddress?.country).toBeUndefined()
  })

  it('stringifies the numeric pincode into postalCode', () => {
    const order = transformOrder(makeOrder(), 'AED')
    expect(order.shippingAddress?.postalCode).toBe('600042')
    expect(order.billingAddress?.postalCode).toBe('600042')
  })

  it('parses the space-separated createdAt/updatedAt into ISO 8601', () => {
    const order = transformOrder(makeOrder(), 'AED')
    OrderSchema.parse(order)
    expect(order.createdAt).toBe('2013-11-22T13:00:00.000Z')
    expect(order.updatedAt).toBe('2013-11-22T13:00:00.000Z')
  })

  it('never sets fulfillmentStatus, cancelledAt, or cancelReason (undocumented / no cancel endpoint)', () => {
    const order = transformOrder(makeOrder(), 'AED')
    expect(order.fulfillmentStatus).toBeUndefined()
    expect(order.cancelledAt).toBeUndefined()
    expect(order.cancelReason).toBeUndefined()
  })

  it('preserves the complete raw payload in metadata', () => {
    const raw = makeOrder()
    const order = transformOrder(raw, 'AED')
    expect(order.metadata).toEqual(raw)
  })

  it('untransformOrder builds the documented create-sales-order field names, reading the display-name/id fields the canonical schema has no slot for out of metadata', () => {
    const order = transformOrder(makeOrder(), 'AED')
    const body = untransformOrder(order)
    expect(body).toMatchObject({
      customerId: '1',
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      customerMobile: '9000000000',
      customerPincode: '600042',
      shippingId: '1',
      shippingName: 'Test Customer',
      shippingAddress1: '1 Example Street',
      shippingPlace: 'chennai',
      shippingState: 'Tamil Nadu',
      shippingCountry: 'IN',
      shippingPincode: '600042',
      deliveryDate: '2013-11-22 13:00:00',
    })
    expect(body['orderItems']).toEqual([{ rowNo: 1, itemId: 1, itemReferenceCode: 'LUX-001', quantity: 10 }])
  })

  it('untransformOrder throws a specific, complete list of missing mandatory fields', () => {
    expect(() => untransformOrder({})).toThrow(
      /customerId.*metadata\.customerName.*phone.*email.*billingAddress\.postalCode.*metadata\.shippingId.*metadata\.shippingName.*shippingAddress\.line1.*shippingAddress\.region.*shippingAddress\.country.*shippingAddress\.postalCode.*metadata\.deliveryDate.*lineItems/s,
    )
  })

  it('untransformOrder throws when a line item is missing sku (itemReferenceCode is mandatory)', () => {
    const order = transformOrder(
      makeOrder({ orderItems: [{ itemId: 1, itemReferenceCode: '', salePrice: 10, quantity: 1 }] }),
      'AED',
    )
    expect(() => untransformOrder(order)).toThrow(/missing sku \(itemReferenceCode\)/)
  })
})
