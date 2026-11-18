import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawSalesloftDeal } from '../../../../../../../src/verticals/crm/adapters/salesloft/transform/deal'

function makeRaw(overrides: Partial<RawSalesloftDeal> = {}): RawSalesloftDeal {
  return { id: 7, ...overrides }
}

describe('salesloft transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw()).id).toBe('7')
  })

  it('maps amount to value.amount with USD currency', () => {
    const result = transformDeal(makeRaw({ amount: 2500 }))
    expect(result.value?.amount).toBe(2500)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps stage_name to stage_id', () => {
    expect(transformDeal(makeRaw({ stage_name: 'Demo' })).stage_id).toBe('Demo')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('salesloft untransformDeal', () => {
  it('maps stage_id to stage_name', () => {
    expect(untransformDeal({ stage_id: 'Closed Won' }).stage_name).toBe('Closed Won')
  })
})
