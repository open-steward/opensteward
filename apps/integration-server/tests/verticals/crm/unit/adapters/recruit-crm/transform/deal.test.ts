import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawRecruitCrmDeal,
} from '../../../../../../../src/verticals/crm/adapters/recruit-crm/transform/deal'

function makeRaw(overrides: Partial<RawRecruitCrmDeal> = {}): RawRecruitCrmDeal {
  return { id: '1', ...overrides }
}

describe('recruit-crm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: '5' })).id).toBe('5')
  })

  it('maps title from title field', () => {
    expect(transformDeal(makeRaw({ title: 'Senior Engineer' })).title).toBe('Senior Engineer')
  })

  it('falls back to name when title absent', () => {
    expect(transformDeal(makeRaw({ name: 'Fallback' })).title).toBe('Fallback')
  })

  it('maps value from salary_from', () => {
    const result = transformDeal(makeRaw({ salary_from: 90000, currency: 'USD' }))
    expect(result.value?.amount).toBe(90000)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps stage_id from pipeline_stage_id', () => {
    expect(transformDeal(makeRaw({ pipeline_stage_id: 'stage-1' })).stage_id).toBe('stage-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: '5' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('recruit-crm untransformDeal', () => {
  it('maps value.amount to salary_from', () => {
    const result = untransformDeal({ value: { amount: 80000, currency: 'USD' } })
    expect(result.salary_from).toBe(80000)
  })
})
