import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawSugarOpportunity } from '../../../../../../../src/verticals/crm/adapters/sugarcrm/transform/deal'

function makeRaw(overrides: Partial<RawSugarOpportunity> = {}): RawSugarOpportunity {
  return { id: 'SOPP1', name: 'Big Opp', ...overrides }
}

describe('sugarcrm transformDeal', () => {
  it('maps id and title', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('SOPP1')
    expect(result.title).toBe('Big Opp')
  })

  it('maps amount to value.amount', () => {
    const result = transformDeal(makeRaw({ amount: '5000', currency_id: 'EUR' }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps sales_stage to stage_id', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Negotiation' })).stage_id).toBe('Negotiation')
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

describe('sugarcrm untransformDeal', () => {
  it('maps stage_id to sales_stage', () => {
    expect(untransformDeal({ stage_id: 'Closed Won' }).sales_stage).toBe('Closed Won')
  })
})
