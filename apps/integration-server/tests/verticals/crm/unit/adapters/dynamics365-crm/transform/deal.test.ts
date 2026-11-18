import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawDynamicsOpportunity } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/deal'

function makeRaw(overrides: Partial<RawDynamicsOpportunity> = {}): RawDynamicsOpportunity {
  return { opportunityid: 'o1', name: 'Big Deal', ...overrides }
}

describe('dynamics365-crm transformDeal', () => {
  it('maps opportunityid to id', () => {
    expect(transformDeal(makeRaw()).id).toBe('o1')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from estimatedvalue', () => {
    const result = transformDeal(makeRaw({ estimatedvalue: 5000 }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps contact_ids from _parentcontactid_value', () => {
    const result = transformDeal(makeRaw({ _parentcontactid_value: 'con1' }))
    expect(result.contact_ids).toEqual(['con1'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps name', () => {
    expect(untransformDeal({ title: 'Test' }).name).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
