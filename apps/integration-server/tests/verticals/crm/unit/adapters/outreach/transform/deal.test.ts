import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawOutreachDeal,
} from '../../../../../../../src/verticals/crm/adapters/outreach/transform/deal'

function makeRaw(overrides: Partial<RawOutreachDeal> = {}): RawOutreachDeal {
  return {
    id: '1',
    type: 'opportunity',
    attributes: {},
    ...overrides,
  }
}

describe('outreach transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: '7' })).id).toBe('7')
  })

  it('maps title from attributes.name', () => {
    expect(transformDeal(makeRaw({ attributes: { name: 'Big Deal' } })).title).toBe('Big Deal')
  })

  it('maps value from amount', () => {
    const result = transformDeal(makeRaw({ attributes: { amount: 5000 } }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps company_id from account relationship', () => {
    const result = transformDeal(makeRaw({
      attributes: {},
      relationships: { account: { data: { id: '10', type: 'account' } } },
    }))
    expect(result.company_id).toBe('10')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: '7' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('outreach untransformDeal', () => {
  it('wraps output in data envelope with type opportunity', () => {
    const result = untransformDeal({ title: 'Deal' })
    expect((result.data as Record<string, unknown>)?.['type']).toBe('opportunity')
  })
})
