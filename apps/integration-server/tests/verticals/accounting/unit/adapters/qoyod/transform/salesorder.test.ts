import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type QoyodQuote,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeRaw(overrides: Partial<QoyodQuote> = {}): QoyodQuote {
  return {
    id: 1100,
    reference: 'QUOTE-2025-001',
    customer_id: 300,
    date: '2025-07-01',
    expiry_date: '2025-07-31',
    status: 'accepted',
    currency: 'SAR',
    total: 2500,
    tax_total: 375,
    line_items: [
      {
        id: 9,
        product_id: 25,
        description: 'Service package',
        quantity: 5,
        unit_price: 500,
        tax_amount: 375,
        total: 2875,
        discount: 0,
        account_id: 80,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformSalesOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformSalesOrder(makeRaw()).id).toBe('1100')
  })

  it('maps accepted status to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps invoiced status to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps converted status to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'converted' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps rejected status to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'rejected' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformSalesOrder(makeRaw()).contactId).toBe('300')
  })

  it('maps currency', () => {
    expect(transformSalesOrder(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformSalesOrder(makeRaw()).totalAmount).toBe(2500)
  })

  it('maps date to postedAt Date', () => {
    expect(transformSalesOrder(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line discount to discountAmount', () => {
    expect(transformSalesOrder(makeRaw()).lineItems?.[0]?.discountAmount).toBe(0)
  })

  it('passes SalesOrderSchema.parse', () => {
    expect(() => SalesOrderSchema.parse(transformSalesOrder(makeRaw()))).not.toThrow()
  })
})
