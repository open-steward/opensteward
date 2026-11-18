import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MoneybirdOrder } from '../../../../../../../src/verticals/accounting/adapters/moneybird/transform/order'

function makeOrder(overrides: Partial<MoneybirdOrder> = {}): MoneybirdOrder {
  return { id: 1000, contact_id: 200, total_price_incl_tax: '2000', currency: 'EUR', state: 'open', date: '2024-08-01', ...overrides }
}

describe('transformOrder (moneybird)', () => {
  it('maps id and type=SALES', () => {
    expect(transformOrder(makeOrder()).id).toBe('1000')
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })
  it('draft → DRAFT', () => { expect(transformOrder(makeOrder({ state: 'draft' })).status).toBe('DRAFT') })
  it('open → ACTIVE', () => { expect(transformOrder(makeOrder({ state: 'open' })).status).toBe('ACTIVE') })
  it('completed → COMPLETED', () => { expect(transformOrder(makeOrder({ state: 'completed' })).status).toBe('COMPLETED') })
  it('cancelled → CANCELLED', () => { expect(transformOrder(makeOrder({ state: 'cancelled' })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
