import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawWalmartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/walmart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawWalmartOrder> = {}): RawWalmartOrder {
  return {
    purchaseOrderId: 'PO-2024050100001',
    customerOrderId: 'CO-987654321',
    customerEmailId: 'buyer@example.com',
    orderDate: '2024-05-01T10:00:00.000Z',
    status: 'Shipped',
    orderSummary: {
      totalAmount: { currency: 'USD', amount: 49.27 },
      orderSubTotal: { currency: 'USD', amount: 39.98 },
      shippingAmount: { currency: 'USD', amount: 5.99 },
      taxAmount: { currency: 'USD', amount: 3.30 },
    },
    orderLines: {
      orderLine: [
        {
          lineNumber: '1',
          item: {
            productName: 'Premium Widget',
            sku: 'WM-WIDGET-001',
          },
          charges: [
            {
              chargeType: 'PRODUCT',
              chargeName: 'ItemPrice',
              chargeAmount: { currency: 'USD', amount: 39.98 },
            },
          ],
          orderLineQuantity: {
            unitOfMeasurement: 'EACH',
            amount: '2',
          },
          orderLineStatuses: [
            {
              status: 'Shipped',
              trackingInfo: {
                shipDateTime: '2024-05-02T08:00:00.000Z',
                carrierName: { carrier: 'UPS' },
                trackingNumber: '1Z999AA10123456784',
                trackingURL: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
              },
            },
          ],
        },
      ],
    },
    shippingInfo: {
      postalAddress: {
        name: 'Jane Doe',
        address1: '100 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '73301',
        country: 'US',
      },
      phone: '+15125550100',
    },
    ...overrides,
  }
}

describe('transformOrder (Walmart)', () => {
  it('maps core fields and uses purchaseOrderId as canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('PO-2024050100001')
    expect(result.orderNumber).toBe('CO-987654321')
    expect(result.email).toBe('buyer@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 4927, currency: 'USD' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price derived from charges/quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.sku).toBe('WM-WIDGET-001')
    expect(li.quantity).toBe(2)
    // 39.98 total / 2 qty = 19.99 unit price
    expect(li.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps pricing summary fields to canonical Money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 3998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 330, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
  })

  it('maps every fulfillment status', () => {
    expect(mapFulfillmentStatus('Shipped')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('Delivered')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('Acknowledged')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('Created')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })

  it('maps every financial status', () => {
    expect(mapFinancialStatus('Shipped')).toBe('PAID')
    expect(mapFinancialStatus('Acknowledged')).toBe('PAID')
    expect(mapFinancialStatus('Created')).toBe('PENDING')
    expect(mapFinancialStatus('Cancelled')).toBe('VOIDED')
    expect(mapFinancialStatus('Refund')).toBe('REFUNDED')
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })

  it('extracts shipping address from shippingInfo', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '100 Main St',
      line2: undefined,
      city: 'Austin',
      region: 'TX',
      postalCode: '73301',
      country: 'US',
    })
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('sets cancelledAt when order status is Cancelled', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
    expect(result.cancelledAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.financialStatus).toBe('VOIDED')
  })
})
