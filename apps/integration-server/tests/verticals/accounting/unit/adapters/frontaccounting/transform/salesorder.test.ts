import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/salesorder'
import type { FAOrder } from '../../../../../../../src/verticals/accounting/adapters/frontaccounting/transform/order'

function makeRaw(overrides: Partial<FAOrder> = {}): FAOrder {
  return {
    id: 61,
    reference: 'SO-2024-002',
    ord_date: '2024-01-06',
    debtor_no: 9,
    curr_code: 'EUR',
    total: 1800,
    tax_total: 300,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (FrontAccounting)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('61')
    expect(result.contactId).toBe('9')
    expect(result.totalAmount).toBe(1800)
    expect(result.currency).toBe('EUR')
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
