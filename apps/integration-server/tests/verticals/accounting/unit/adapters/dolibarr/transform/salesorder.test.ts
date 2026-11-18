import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/salesorder'
import type { DolibarrOrder } from '../../../../../../../src/verticals/accounting/adapters/dolibarr/transform/order'

function makeRaw(overrides: Partial<DolibarrOrder> = {}): DolibarrOrder {
  return {
    id: 21,
    ref: 'CO2024-0002',
    status: 1,
    date: 1705276800,
    total_ht: 1500,
    total_tva: 300,
    total_ttc: 1800,
    multicurrency_code: 'EUR',
    fk_soc: 7,
    lines: [],
    ...overrides,
  }
}

describe('transformSalesOrder (Dolibarr)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('21')
    expect(result.contactId).toBe('7')
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
