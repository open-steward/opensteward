import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type MyobOrder } from '../../../../../../../src/verticals/accounting/adapters/myob/transform/order'

function makeOrder(overrides: Partial<MyobOrder> = {}): MyobOrder {
  return { UID: 'uid-10', Number: 'SO-001', Customer: { UID: 'cust-1' }, Date: '2024-08-01', TotalAmount: 3000, Status: 'Open', ...overrides }
}

describe('transformOrder (myob)', () => {
  it('maps id and type=SALES', () => {
    expect(transformOrder(makeOrder()).id).toBe('uid-10')
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })
  it('Open → ACTIVE', () => { expect(transformOrder(makeOrder()).status).toBe('ACTIVE') })
  it('Closed → COMPLETED', () => { expect(transformOrder(makeOrder({ Status: 'Closed' })).status).toBe('COMPLETED') })
  it('Voided → CANCELLED', () => { expect(transformOrder(makeOrder({ Status: 'Voided' })).status).toBe('CANCELLED') })
  it('passes raw as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
