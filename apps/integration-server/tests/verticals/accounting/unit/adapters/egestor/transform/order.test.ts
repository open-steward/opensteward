import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type EgestorOrderStub,
} from '../../../../../../../src/verticals/accounting/adapters/egestor/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

describe('egestor transformOrder (stub)', () => {
  it('returns metadata equal to raw input', () => {
    const raw: EgestorOrderStub = { someKey: 'someValue' }
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns object with only metadata key', () => {
    const result = transformOrder({})
    expect(Object.keys(result)).toEqual(['metadata'])
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder({})
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
