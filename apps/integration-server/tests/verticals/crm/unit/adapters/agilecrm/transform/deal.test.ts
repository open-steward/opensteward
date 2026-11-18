import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawAgileCrmDeal } from '../../../../../../../src/verticals/crm/adapters/agilecrm/transform/deal'

function makeRaw(overrides: Partial<RawAgileCrmDeal> = {}): RawAgileCrmDeal {
  return { id: 1, name: 'Big Deal', ...overrides }
}

describe('agilecrm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from expected_value', () => {
    const result = transformDeal(makeRaw({ expected_value: 500 }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps stage_id from milestone', () => {
    expect(transformDeal(makeRaw({ milestone: 'Proposal' })).stage_id).toBe('Proposal')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps title back to name', () => {
    const result = untransformDeal({ title: 'Test' })
    expect(result.name).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
