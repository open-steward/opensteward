import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MekariJurnalOrder } from '../../../../../../../src/verticals/accounting/adapters/mekarijurnal/transform/order'

function makeOrder(overrides: Partial<MekariJurnalOrder> = {}): MekariJurnalOrder {
  return {
    id: 400,
    date: '2024-08-01',
    status: 'open',
    person_id: 55,
    total: 800000,
    currency_code: 'IDR',
    lines: [],
    ...overrides,
  }
}

describe('transformOrder (mekarijurnal)', () => {
  it('maps core fields correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('400')
    expect(result.contactId).toBe('55')
    expect(result.totalAmount).toBe(800000)
    expect(result.currency).toBe('IDR')
    expect(result.type).toBe('SALES')
  })

  it('parses date as Date object', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-08-01'))
  })

  it('maps open to ACTIVE', () => {
    expect(transformOrder(makeOrder({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps paid/closed to COMPLETED', () => {
    expect(transformOrder(makeOrder({ status: 'paid' })).status).toBe('COMPLETED')
    expect(transformOrder(makeOrder({ status: 'closed' })).status).toBe('COMPLETED')
  })

  it('maps voided/cancelled to CANCELLED', () => {
    expect(transformOrder(makeOrder({ status: 'voided' })).status).toBe('CANCELLED')
    expect(transformOrder(makeOrder({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to DRAFT', () => {
    expect(transformOrder(makeOrder({ status: 'pending' })).status).toBe('DRAFT')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
