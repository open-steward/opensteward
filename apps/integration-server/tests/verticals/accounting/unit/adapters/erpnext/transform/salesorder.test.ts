import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type ErpNextSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/erpnext/transform/salesorder'

function makeRaw(overrides: Partial<ErpNextSalesOrder> = {}): ErpNextSalesOrder {
  return {
    name: 'SO-2024-00002',
    transaction_date: '2024-01-08',
    status: 'To Bill',
    currency: 'USD',
    base_grand_total: 5000,
    customer: 'Beta Corp',
    remarks: '',
    items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (ERPNext)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('SO-2024-00002')
    expect(result.contactId).toBe('Beta Corp')
    expect(result.totalAmount).toBe(5000)
    expect(result.currency).toBe('USD')
  })

  it('maps status Cancelled to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
