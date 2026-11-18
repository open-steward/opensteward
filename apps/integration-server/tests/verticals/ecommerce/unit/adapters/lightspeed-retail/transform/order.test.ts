import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawLightspeedSale,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeSale(overrides: Partial<RawLightspeedSale> = {}): RawLightspeedSale {
  return {
    saleID: '5001',
    referenceNumber: 'REF-001',
    ticketNumber: 'T-1001',
    customerID: '201',
    shopID: '1',
    completed: 'true',
    voided: 'false',
    calcTotal: '29.98',
    taxTotal: '2.40',
    calcDiscount: '5.00',
    createTime: '2024-05-01T10:00:00+00:00',
    timeStamp: '2024-05-01T12:00:00+00:00',
    completeTime: '2024-05-01T11:30:00+00:00',
    SaleLines: {
      SaleLine: [
        {
          saleLineID: 'SL_001',
          itemID: '501',
          unitQuantity: '2',
          unitPrice: '14.99',
          calcTotal: '29.98',
          discountAmount: '5.00',
        },
      ],
    },
    SalePayments: {
      SalePayment: [
        {
          salePaymentID: 'SP_001',
          paymentTypeID: '1',
          amount: '29.98',
          createTime: '2024-05-01T11:00:00+00:00',
        },
      ],
    },
    ...overrides,
  }
}

describe('transformOrder (Lightspeed Retail)', () => {
  it('maps core fields with decimal string conversion', () => {
    const result = transformOrder(makeSale())
    expect(result.id).toBe('5001')
    expect(result.orderNumber).toBe('T-1001')
    expect(result.customerId).toBe('201')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 2998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 240, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeSale())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('SL_001')
    expect(li.variantId).toBe('501')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 1499, currency: 'USD' })
  })

  it('maps financial and fulfillment status', () => {
    const result = transformOrder(makeSale())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps pending sale', () => {
    const result = transformOrder(makeSale({ completed: 'false', voided: 'false' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps voided sale', () => {
    const result = transformOrder(makeSale({ voided: 'true' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBeDefined()
  })

  it('maps transaction ids from SalePayments', () => {
    const result = transformOrder(makeSale())
    expect(result.transactionIds).toEqual(['SP_001'])
  })

  it('handles single SaleLine (non-array envelope)', () => {
    const result = transformOrder(
      makeSale({
        SaleLines: {
          SaleLine: {
            saleLineID: 'SL_SINGLE',
            itemID: '502',
            unitQuantity: '1',
            unitPrice: '9.99',
            calcTotal: '9.99',
          },
        },
      }),
    )
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.id).toBe('SL_SINGLE')
  })

  it('excludes customerID "0"', () => {
    const result = transformOrder(makeSale({ customerID: '0' }))
    expect(result.customerId).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeSale()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeSale())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeSale())
    const raw = untransformOrder(canonical, '1')
    expect(raw['shopID']).toBe('1')
    expect(raw['customerID']).toBe('201')
  })
})
