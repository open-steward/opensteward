import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import {
  transformSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/salesorder'
import type { GiddhOrderVoucher } from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/order'

function makeRaw(overrides: Partial<GiddhOrderVoucher> = {}): GiddhOrderVoucher {
  return {
    uniqueName: 'sales-order-002',
    number: 'SO-2024-002',
    voucherDate: '2024-03-12',
    dueDate: '2024-03-27',
    grandTotal: 75000,
    taxesTotal: 13500,
    account: { uniqueName: 'customer-jkl', name: 'JKL Inc' },
    status: 'active',
    entries: [],
    ...overrides,
  }
}

describe('transformSalesOrder (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('sales-order-002')
    expect(result.contactId).toBe('customer-jkl')
    expect(result.totalAmount).toBe(75000)
  })

  it('parses voucherDate as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-12'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          description: 'Service B',
          quantity: 3,
          rate: 25000,
          amount: 75000,
          accountUniqueName: 'service-revenue',
          accountName: 'Service Revenue',
        },
      ],
    })
    const result = transformSalesOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].unitQuantity).toBe(3)
    expect(result.lineItems![0].unitAmount).toBe(25000)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
