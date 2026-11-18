import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type SageOrder } from '../../../../../../../src/verticals/accounting/adapters/sagebusinesscloud/transform/order'

describe('transformOrder (SageBusinessCloud)', () => {
  it('maps id correctly', () => {
    const raw: SageOrder = { id: 'ord-001' }
    const result = transformOrder(raw)
    expect(result.id).toBe('ord-001')
  })

  it('sets metadata to raw object', () => {
    const raw: SageOrder = { id: 'ord-002', amount: 1000 }
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { id: 'ord-001' }
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
