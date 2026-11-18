import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawNutshellDeal,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/deal'

function makeRaw(overrides: Partial<RawNutshellDeal> = {}): RawNutshellDeal {
  return { id: 1, ...overrides }
}

describe('nutshell transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps status codes correctly', () => {
    expect(transformDeal(makeRaw({ status: 0 })).status).toBe('open')
    expect(transformDeal(makeRaw({ status: 1 })).status).toBe('won')
    expect(transformDeal(makeRaw({ status: 2 })).status).toBe('lost')
  })

  it('maps value from nested value object', () => {
    const result = transformDeal(makeRaw({ value: { amount: '1000', currency: 'EUR' } }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps stage from milestone', () => {
    const result = transformDeal(makeRaw({ milestone: { id: 3, name: 'Proposal' } }))
    expect(result.stage).toBe('Proposal')
    expect(result.stage_id).toBe('3')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 5 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('nutshell untransformDeal', () => {
  it('maps title to name', () => {
    const result = untransformDeal({ title: 'Big Deal' })
    expect(result.name).toBe('Big Deal')
  })

  it('maps value to nested value object', () => {
    const result = untransformDeal({ value: { amount: 500, currency: 'USD' } })
    expect((result.value as Record<string, unknown>)?.amount).toBe('500')
  })
})
