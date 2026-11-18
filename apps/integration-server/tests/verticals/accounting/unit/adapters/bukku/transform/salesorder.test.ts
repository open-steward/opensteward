import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type BukkuSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/salesorder'

function makeRaw(overrides: Partial<BukkuSalesOrder> = {}): BukkuSalesOrder {
  return {
    id: '70',
    number: 'SO-001',
    date: '2024-08-01',
    total: 2000,
    tax_total: 260,
    status: 'draft',
    contact_id: '42',
    contact_name: 'Acme Sdn Bhd',
    line_items: [],
    ...overrides,
  }
}

describe('transformSalesOrder (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.id).toBe('70')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(2000)
  })

  it('parses date as Date object', () => {
    const result = transformSalesOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'SO-999' })
    const result = transformSalesOrder(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('SO-999')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformSalesOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps confirmed status to ACTIVE', () => {
    expect(transformSalesOrder(makeRaw({ status: 'confirmed' })).status).toBe('ACTIVE')
  })

  it('maps delivered status to COMPLETED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'delivered' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformSalesOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeRaw())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
