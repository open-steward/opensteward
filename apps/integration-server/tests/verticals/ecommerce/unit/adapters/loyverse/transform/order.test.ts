import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawLoyverseReceipt,
  type RawLoyverseLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRawLineItem(overrides: Partial<RawLoyverseLineItem> = {}): RawLoyverseLineItem {
  return {
    id: 'li_001',
    item_id: 'item_001',
    variant_id: 'var_001',
    item_name: 'Wireless Keyboard',
    quantity: 2,
    price: 9.99,
    total_money: 19.98,
    total_discount: 0,
    sku: 'WK-BLK',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<RawLoyverseReceipt> = {}): RawLoyverseReceipt {
  return {
    receipt_number: 'RCP-1042',
    receipt_type: 'SALE',
    customer_id: 'cus_001',
    store_id: 'store_001',
    total_money: 19.98,
    total_tax: 1.8,
    total_discount: 0,
    note: 'Handle with care',
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-03-01T10:05:00Z',
    line_items: [makeRawLineItem()],
    ...overrides,
  }
}

describe('transformOrder (Loyverse)', () => {
  it('maps receipt_number to id, orderNumber, and name', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('RCP-1042')
    expect(result.orderNumber).toBe('RCP-1042')
    expect(result.name).toBe('RCP-1042')
  })

  it('uses order field for name when present', () => {
    const result = transformOrder(makeRaw({ order: 'Order #42' }))
    expect(result.name).toBe('Order #42')
  })

  it('maps customerId', () => {
    const result = transformOrder(makeRaw())
    expect(result.customerId).toBe('cus_001')
  })

  it('defaults currency to USD', () => {
    const result = transformOrder(makeRaw())
    expect(result.currency).toBe('USD')
  })

  it('accepts explicit currency', () => {
    const result = transformOrder(makeRaw(), 'EUR')
    expect(result.currency).toBe('EUR')
  })

  it('converts total_money to minor units', () => {
    const result = transformOrder(makeRaw({ total_money: 19.98 }))
    expect(result.totalPrice).toEqual({ amount: 1998, currency: 'USD' })
  })

  it('converts total_tax to minor units', () => {
    const result = transformOrder(makeRaw({ total_tax: 1.8 }))
    expect(result.totalTax).toEqual({ amount: 180, currency: 'USD' })
  })

  it('converts total_discount to minor units', () => {
    const result = transformOrder(makeRaw({ total_discount: 2.0 }))
    expect(result.totalDiscounts).toEqual({ amount: 200, currency: 'USD' })
  })

  it('omits totalPrice when total_money is absent', () => {
    const result = transformOrder(makeRaw({ total_money: undefined }))
    expect(result.totalPrice).toBeUndefined()
  })

  it('sets financialStatus to PAID for SALE receipts', () => {
    const result = transformOrder(makeRaw({ receipt_type: 'SALE' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('sets financialStatus to REFUNDED for REFUND receipts', () => {
    const result = transformOrder(makeRaw({ receipt_type: 'REFUND' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('sets financialStatus to VOIDED when cancelled_at is present', () => {
    const result = transformOrder(makeRaw({ cancelled_at: '2024-03-02T00:00:00Z' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('sets fulfillmentStatus to FULFILLED (POS receipts are always fulfilled)', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items with correct fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li_001')
    expect(li.productId).toBe('item_001')
    expect(li.variantId).toBe('var_001')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 999, currency: 'USD' })
    expect(li.sku).toBe('WK-BLK')
  })

  it('returns undefined lineItems when line_items is empty', () => {
    const result = transformOrder(makeRaw({ line_items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('falls back to variant_id as line item id when id is absent', () => {
    const result = transformOrder(
      makeRaw({
        line_items: [makeRawLineItem({ id: undefined, variant_id: 'var_002' })],
      }),
    )
    expect(result.lineItems![0]!.id).toBe('var_002')
  })

  it('maps note', () => {
    const result = transformOrder(makeRaw())
    expect(result.note).toBe('Handle with care')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T10:05:00Z')
  })

  it('falls back to receipt_date for createdAt', () => {
    const result = transformOrder(
      makeRaw({ created_at: undefined, receipt_date: '2024-03-01T09:00:00Z' }),
    )
    expect(result.createdAt).toBe('2024-03-01T09:00:00Z')
  })

  it('maps cancelledAt', () => {
    const result = transformOrder(makeRaw({ cancelled_at: '2024-03-02T00:00:00Z' }))
    expect(result.cancelledAt).toBe('2024-03-02T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const minimal: RawLoyverseReceipt = { receipt_number: 'RCP-MIN' }
    const result = transformOrder(minimal)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Loyverse)', () => {
  it('maps customerId and note', () => {
    const result = untransformOrder({ customerId: 'cus_001', note: 'A note' })
    expect(result.customer_id).toBe('cus_001')
    expect(result.note).toBe('A note')
    expect(result.receipt_type).toBe('SALE')
  })

  it('maps line items converting price minor→major', () => {
    const result = untransformOrder({
      lineItems: [
        {
          id: 'li_001',
          productId: 'item_001',
          variantId: 'var_001',
          title: 'Keyboard',
          quantity: 1,
          price: { amount: 999, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    const items = result.line_items as Array<{ price: number }>
    expect(items[0]!.price).toBeCloseTo(9.99, 5)
  })
})
