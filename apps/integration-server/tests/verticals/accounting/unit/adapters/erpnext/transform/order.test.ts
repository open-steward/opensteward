import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type ErpNextOrder } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/order'

function makeRaw(overrides: Partial<ErpNextOrder> = {}): ErpNextOrder {
  return {
    name: 'SO-2024-00001',
    transaction_date: '2024-01-05',
    status: 'To Deliver and Bill',
    currency: 'INR',
    base_grand_total: 25000,
    customer: 'ACME Corp',
    remarks: 'Test order',
    items: [],
    ...overrides,
  }
}

describe('transformOrder (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('SO-2024-00001')
    expect(result.contactId).toBe('ACME Corp')
    expect(result.totalAmount).toBe(25000)
    expect(result.currency).toBe('INR')
    expect(result.type).toBe('SALES')
  })

  it('maps status Draft to DRAFT', () => {
    expect(transformOrder(makeRaw({ status: 'Draft' })).status).toBe('DRAFT')
  })

  it('maps status Completed to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'Completed' })).status).toBe('COMPLETED')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-01-05'))
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
