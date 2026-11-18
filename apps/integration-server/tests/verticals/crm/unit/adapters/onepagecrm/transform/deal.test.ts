import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawOnePageCrmDeal,
} from '../../../../../../../src/verticals/crm/adapters/onepagecrm/transform/deal'

function makeRaw(overrides: Partial<RawOnePageCrmDeal> = {}): RawOnePageCrmDeal {
  return { id: '1', name: 'Deal', ...overrides }
}

describe('onepagecrm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: '7' })).id).toBe('7')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('maps value with currency', () => {
    const result = transformDeal(makeRaw({ amount: 1000, currency: 'EUR' }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('defaults currency to USD when not provided', () => {
    const result = transformDeal(makeRaw({ amount: 500 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('maps contact_ids from contact_id', () => {
    const result = transformDeal(makeRaw({ contact_id: 'c1' }))
    expect(result.contact_ids).toEqual(['c1'])
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

describe('onepagecrm untransformDeal', () => {
  it('maps title to name', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result['name']).toBe('New Deal')
  })
})
