import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  type GiddhOrderVoucher,
} from '../../../../../../../src/verticals/accounting/adapters/giddh/transform/order'

function makeRaw(overrides: Partial<GiddhOrderVoucher> = {}): GiddhOrderVoucher {
  return {
    uniqueName: 'sales-order-001',
    number: 'SO-2024-001',
    voucherDate: '2024-03-10',
    dueDate: '2024-03-25',
    grandTotal: 50000,
    taxesTotal: 9000,
    account: { uniqueName: 'customer-ghi', name: 'GHI Ltd' },
    status: 'active',
    entries: [],
    ...overrides,
  }
}

describe('transformOrder (giddh)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('sales-order-001')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('customer-ghi')
    expect(result.totalAmount).toBe(50000)
  })

  it('parses voucherDate as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-03-10'))
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status completed to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })

  it('maps status invoiced to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'invoiced' })).status).toBe('COMPLETED')
  })

  it('maps entries to lineItems', () => {
    const raw = makeRaw({
      entries: [
        {
          uniqueName: 'entry-001',
          description: 'Product A',
          quantity: 5,
          rate: 10000,
          amount: 50000,
          accountUniqueName: 'sales-revenue',
          accountName: 'Sales Revenue',
        },
      ],
    })
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(50000)
    expect(result.lineItems![0].unitQuantity).toBe(5)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
