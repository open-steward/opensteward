import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawTrendyolOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawTrendyolOrder> = {}): RawTrendyolOrder {
  return {
    shipmentPackageId: 987654321,
    orderNumber: 'TY-2024-001',
    customerId: 55555,
    shipmentPackageStatus: 'Delivered',
    orderDate: 1704067200000, // 2024-01-01T00:00:00.000Z
    lastModifiedDate: 1704153600000, // 2024-01-02T00:00:00.000Z
    customerEmail: 'buyer@example.com',
    packageTotalPrice: 299.99,
    packageGrossAmount: 299.99,
    packageTotalDiscount: 0,
    currencyCode: 'TRY',
    lines: [
      {
        lineId: 111,
        contentId: 222,
        productName: 'Smart Headphones',
        stockCode: 'SKU-HP-001',
        barcode: '8690000000001',
        quantity: 1,
        lineUnitPrice: 299.99,
        lineGrossAmount: 299.99,
        lineTotalDiscount: 0,
        currencyCode: 'TRY',
        orderLineItemStatusName: 'Delivered',
      },
    ],
    shipmentAddress: {
      address1: 'Atatürk Caddesi No:5',
      city: 'Ankara',
      postalCode: '06000',
      countryCode: 'TR',
    },
    invoiceAddress: {
      address1: 'Cumhuriyet Mah. No:1',
      city: 'Ankara',
      postalCode: '06000',
      countryCode: 'TR',
    },
    cargoTrackingNumber: 'TRK123456',
    cargoProviderName: 'MNG Kargo',
    ...overrides,
  }
}

describe('transformOrder (Trendyol)', () => {
  it('maps id from shipmentPackageId and orderNumber/name', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('987654321')
    expect(result.orderNumber).toBe('TY-2024-001')
    expect(result.name).toBe('#TY-2024-001')
  })

  it('maps financial and fulfillment status from Delivered', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status Created → PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ shipmentPackageStatus: 'Created' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status Cancelled → VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ shipmentPackageStatus: 'Cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts decimal TRY price to minor units (×100)', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice?.amount).toBe(29999)
    expect(result.totalPrice?.currency).toBe('TRY')
  })

  it('maps customerId and email', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('55555')
    expect(result.email).toBe('buyer@example.com')
  })

  it('maps line items with id, title, price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.id).toBe('111')
    expect(result.lineItems?.[0]?.title).toBe('Smart Headphones')
    expect(result.lineItems?.[0]?.price.amount).toBe(29999)
  })

  it('maps shippingAddress from shipmentAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('Atatürk Caddesi No:5')
    expect(result.shippingAddress?.city).toBe('Ankara')
    expect(result.shippingAddress?.country).toBe('TR')
  })

  it('converts epoch ms timestamps to ISO strings', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
