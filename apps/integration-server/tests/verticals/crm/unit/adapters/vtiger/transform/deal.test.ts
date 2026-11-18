import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawVtigerDeal } from '../../../../../../../src/verticals/crm/adapters/vtiger/transform/deal'

function makeRaw(overrides: Partial<RawVtigerDeal> = {}): RawVtigerDeal {
  return { id: 'VTDEAL1', potentialname: 'VT Opportunity', ...overrides }
}

describe('vtiger transformDeal', () => {
  it('maps id and potentialname to title', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('VTDEAL1')
    expect(result.title).toBe('VT Opportunity')
  })

  it('maps string amount to numeric value', () => {
    const result = transformDeal(makeRaw({ amount: '7500' }))
    expect(result.value?.amount).toBe(7500)
  })

  it('maps sales_stage to stage_id', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Demo' })).stage_id).toBe('Demo')
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

describe('vtiger untransformDeal', () => {
  it('converts value.amount to string amount', () => {
    expect(untransformDeal({ value: { amount: 500, currency: 'USD' } }).amount).toBe('500')
  })
})
