import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawEposNowTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeTransaction(overrides: Partial<RawEposNowTransaction> = {}): RawEposNowTransaction {
  return {
    Id: 80001,
    TransactionNumber: '1001',
    CustomerId: 5001,
    LocationId: 1,
    TotalAmount: 15.5,
    TotalTax: 2.58,
    DiscountAmount: 1.0,
    Voided: false,
    Completed: true,
    TransactionItems: [
      {
        Id: 90001,
        ProductId: 12345,
        ProductName: 'Flat White',
        Quantity: 2,
        UnitPrice: 3.5,
        TotalPrice: 7.0,
      },
    ],
    Tenders: [
      { Id: 70001, Amount: 15.5, TenderTypeName: 'Card' },
    ],
    DateTime: '2024-06-15T14:30:00Z',
    CreatedDate: '2024-06-15T14:30:00Z',
    LastUpdatedDate: '2024-06-15T14:31:00Z',
    ...overrides,
  }
}

describe('transformOrder (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeTransaction())
    expect(result.id).toBe('80001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('5001')
    expect(result.currency).toBe('GBP')
    expect(result.totalPrice).toEqual({ amount: 1550, currency: 'GBP' })
  })

  it('maps tax and discounts', () => {
    const result = transformOrder(makeTransaction())
    expect(result.totalTax).toEqual({ amount: 258, currency: 'GBP' })
    expect(result.totalDiscounts).toEqual({ amount: 100, currency: 'GBP' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('90001')
    expect(li.productId).toBe('12345')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 350, currency: 'GBP' })
  })

  it('maps financial status PAID for completed', () => {
    const result = transformOrder(makeTransaction())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps financial status VOIDED for voided', () => {
    const result = transformOrder(makeTransaction({ Voided: true }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps financial status PENDING for incomplete', () => {
    const result = transformOrder(makeTransaction({ Completed: false }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps tender ids as transaction ids', () => {
    const result = transformOrder(makeTransaction())
    expect(result.transactionIds).toEqual(['70001'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeTransaction())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles missing line items', () => {
    const result = transformOrder(makeTransaction({ TransactionItems: undefined }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('untransformOrder (Epos Now)', () => {
  it('wraps line items for transaction', () => {
    const canonical = transformOrder(makeTransaction())
    const raw = untransformOrder(canonical)
    const items = raw['TransactionItems'] as Array<Record<string, unknown>>
    expect(items[0]!['ProductName']).toBe('Flat White')
    expect(items[0]!['Quantity']).toBe(2)
    expect(items[0]!['ProductId']).toBe(12345)
  })
})
