import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/deal'
import type { RawSuiteCrmOpportunity } from '../../../../../../../src/verticals/crm/adapters/suitecrm/transform/deal'

function makeRaw(overrides: Partial<RawSuiteCrmOpportunity> = {}): RawSuiteCrmOpportunity {
  return { id: 'd1', ...overrides }
}

describe('suitecrm transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('d1')
  })
  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })
  it('maps value from amount with currency_name', () => {
    const result = transformDeal(makeRaw({ amount: 1000, currency_name: 'EUR' }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })
  it('maps company_id from account_id', () => {
    expect(transformDeal(makeRaw({ account_id: 'acc1' })).company_id).toBe('acc1')
  })
  it('maps stage_id from sales_stage', () => {
    expect(transformDeal(makeRaw({ sales_stage: 'Prospecting' })).stage_id).toBe('Prospecting')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })
  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
