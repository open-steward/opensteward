import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type BukkuOrder } from '../../../../../../../src/verticals/accounting/adapters/bukku/transform/order'

function makeRaw(overrides: Partial<BukkuOrder> = {}): BukkuOrder {
  return {
    id: '50',
    number: 'ORD-001',
    date: '2024-06-01',
    total: 800,
    tax_total: 104,
    status: 'draft',
    contact_id: '42',
    contact_name: 'Acme Sdn Bhd',
    line_items: [],
    ...overrides,
  }
}

describe('transformOrder (bukku)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('50')
    expect(result.contactId).toBe('42')
    expect(result.totalAmount).toBe(800)
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeRaw())
    expect(result.postedAt).toEqual(new Date('2024-06-01'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw({ number: 'ORD-999' })
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect((result.metadata as Record<string, unknown>)['number']).toBe('ORD-999')
  })

  it('maps draft status to DRAFT', () => {
    expect(transformOrder(makeRaw({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps confirmed status to ACTIVE', () => {
    expect(transformOrder(makeRaw({ status: 'confirmed' })).status).toBe('ACTIVE')
  })

  it('maps delivered status to COMPLETED', () => {
    expect(transformOrder(makeRaw({ status: 'delivered' })).status).toBe('COMPLETED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformOrder(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
