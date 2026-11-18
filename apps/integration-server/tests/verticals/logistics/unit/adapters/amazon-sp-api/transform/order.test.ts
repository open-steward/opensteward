import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapSpApiOrderStatus,
  type SpApiOrder,
} from '../../../../../../../src/verticals/logistics/adapters/amazon-sp-api/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

/**
 * Fixture: the `getOrders` 200 example in ordersV0.json
 * (github.com/amzn/selling-partner-api-models, models/orders-api-model),
 * with `OrderTotal` from the same file's sandbox `TEST_CASE_200` response
 * (`{"CurrencyCode": "USD", "Amount": "11.01"}`).
 */
function makeOrder(overrides: Partial<SpApiOrder> = {}): SpApiOrder {
  return {
    AmazonOrderId: '902-3159896-1390916',
    PurchaseDate: '2017-01-20T19:49:35Z',
    LastUpdateDate: '2017-01-20T19:49:35Z',
    OrderStatus: 'Pending',
    FulfillmentChannel: 'MFN',
    NumberOfItemsShipped: 0,
    NumberOfItemsUnshipped: 0,
    PaymentMethod: 'Other',
    MarketplaceId: 'ATVPDKIKX0DER',
    ShipmentServiceLevelCategory: 'Standard',
    OrderType: 'StandardOrder',
    EarliestShipDate: '2017-01-20T19:51:16Z',
    LatestShipDate: '2017-01-25T19:49:35Z',
    OrderTotal: { CurrencyCode: 'USD', Amount: '11.01' },
    ShippingAddress: {
      Name: 'Michigan address',
      AddressLine1: '1 Cross St.',
      City: 'Canton',
      StateOrRegion: 'MI',
      PostalCode: '48817',
      CountryCode: 'US',
    },
    ...overrides,
  }
}

describe('amazon-sp-api transformOrder', () => {
  it('maps the documented example and parses as a canonical Order', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder()))
    expect(o.id).toBe('902-3159896-1390916')
    expect(o.status).toBe('PENDING')
    expect(o.currency).toBe('USD')
    expect(o.totalAmount).toBe(1101)
    expect(o.orderAt?.toISOString()).toBe('2017-01-20T19:49:35.000Z')
    expect(o.updatedAt?.toISOString()).toBe('2017-01-20T19:49:35.000Z')
    expect(o.destinationAddress).toEqual({
      name: 'Michigan address',
      street1: '1 Cross St.',
      city: 'Canton',
      state: 'MI',
      postalCode: '48817',
      country: 'US',
    })
  })

  it('does not treat the committed ship window as a shipped time', () => {
    expect(transformOrder(makeOrder()).shippedAt).toBeUndefined()
  })

  it('uses the currency exponent for minor units (JPY has none)', () => {
    const o = OrderSchema.parse(
      transformOrder(makeOrder({ OrderTotal: { CurrencyCode: 'JPY', Amount: '1000' } })),
    )
    expect(o.totalAmount).toBe(1000)
  })

  it('omits the total when either half of the Money is missing', () => {
    const noCurrency = transformOrder(makeOrder({ OrderTotal: { Amount: '11.01' } }))
    expect(noCurrency.totalAmount).toBeUndefined()
    expect(noCurrency.currency).toBeUndefined()
    const noAmount = transformOrder(makeOrder({ OrderTotal: { CurrencyCode: 'USD' } }))
    expect(noAmount.totalAmount).toBeUndefined()
    expect(noAmount.currency).toBeUndefined()
  })

  it('reads orderNumber from SellerOrderId only', () => {
    expect(transformOrder(makeOrder()).orderNumber).toBeUndefined()
    expect(transformOrder(makeOrder({ SellerOrderId: 'S-1' })).orderNumber).toBe('S-1')
  })

  it('maps the documented Address fields and LastUpdateDate', () => {
    const o = OrderSchema.parse(
      transformOrder(
        makeOrder({
          LastUpdateDate: '2017-01-21T08:00:00Z',
          ShippingAddress: {
            Name: 'Michigan address',
            CompanyName: 'Acme',
            AddressLine1: '1 Cross St.',
            AddressLine2: 'Suite 2',
            AddressLine3: 'Floor 3',
            City: 'Canton',
            StateOrRegion: 'MI',
            PostalCode: '48817',
            CountryCode: 'US',
            Phone: '+1 555 0100',
          },
        }),
      ),
    )
    expect(o.updatedAt?.toISOString()).toBe('2017-01-21T08:00:00.000Z')
    expect(o.orderAt?.toISOString()).toBe('2017-01-20T19:49:35.000Z')
    expect(o.destinationAddress).toEqual({
      name: 'Michigan address',
      company: 'Acme',
      street1: '1 Cross St.',
      street2: 'Suite 2, Floor 3',
      city: 'Canton',
      state: 'MI',
      postalCode: '48817',
      country: 'US',
      phone: '+1 555 0100',
    })
  })

  it('omits the address when ShippingAddress is absent (Pending orders)', () => {
    const o = OrderSchema.parse(transformOrder(makeOrder({ ShippingAddress: undefined })))
    expect(o.destinationAddress).toBeUndefined()
  })

  it('maps every documented OrderStatus to a schema-valid status', () => {
    const cases: Record<string, string> = {
      Pending: 'PENDING',
      PendingAvailability: 'PENDING',
      Unshipped: 'AWAITING_SHIPMENT',
      PartiallyShipped: 'SHIPPED',
      Shipped: 'SHIPPED',
      InvoiceUnconfirmed: 'SHIPPED',
      Canceled: 'CANCELLED',
      Unfulfillable: 'unknown',
    }
    for (const [raw, want] of Object.entries(cases)) {
      expect(mapSpApiOrderStatus(raw)).toBe(want)
      expect(OrderSchema.parse(transformOrder(makeOrder({ OrderStatus: raw }))).status).toBe(want)
    }
  })
})
