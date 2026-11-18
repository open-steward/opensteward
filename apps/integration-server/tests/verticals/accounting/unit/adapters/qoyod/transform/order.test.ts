import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type QoyodOrder,
} from '../../../../../../../src/verticals/accounting/adapters/qoyod/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeRaw(overrides: Partial<QoyodOrder> = {}): QoyodOrder {
  return {
    id: 900,
    reference: 'ORD-2025-001',
    customer_id: 300,
    date: '2025-06-15',
    status: 'completed',
    currency: 'SAR',
    total: 1500,
    tax_total: 225,
    line_items: [
      {
        id: 7,
        product_id: 15,
        description: 'Widget A',
        quantity: 3,
        unit_price: 500,
        tax_amount: 75,
        total: 1575,
        account_id: 60,
      },
    ],
    ...overrides,
  }
}

describe('qoyod transformOrder', () => {
  it('maps numeric id to string', () => {
    expect(transformOrder(makeRaw()).id).toBe('900')
  })

  it('maps completed status to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps invoiced status to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'pending' })).status).toBe('ACTIVE')
  })

  it('sets type to SALES', () => {
    expect(transformOrder(makeRaw()).type).toBe('SALES')
  })

  it('maps customer_id to contactId as string', () => {
    expect(transformOrder(makeRaw()).contactId).toBe('300')
  })

  it('maps currency', () => {
    expect(transformOrder(makeRaw()).currency).toBe('SAR')
  })

  it('maps total directly (no ×100 conversion)', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(1500)
  })

  it('maps date to postedAt Date', () => {
    expect(transformOrder(makeRaw()).postedAt).toBeInstanceOf(Date)
  })

  it('maps line product_id to itemId as string', () => {
    expect(transformOrder(makeRaw()).lineItems?.[0]?.itemId).toBe('15')
  })

  it('passes OrderSchema.parse', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
