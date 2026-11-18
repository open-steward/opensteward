import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawKaptureDeal,
} from '../../../../../../../src/verticals/crm/adapters/kapture-crm/transform/deal'

function makeRaw(overrides: Partial<RawKaptureDeal> = {}): RawKaptureDeal {
  return { ...overrides }
}

describe('kapture-crm transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: '7' })).id).toBe('7')
  })

  it('uses title field first', () => {
    expect(transformDeal(makeRaw({ title: 'Deal A', name: 'Deal B' })).title).toBe('Deal A')
  })

  it('falls back to name when title missing', () => {
    expect(transformDeal(makeRaw({ name: 'Deal B' })).title).toBe('Deal B')
  })

  it('maps amount and currency to value', () => {
    const result = transformDeal(makeRaw({ amount: 1000, currency: 'INR' }))
    expect(result.value).toEqual({ amount: 1000, currency: 'INR' })
  })

  it('defaults currency to INR', () => {
    const result = transformDeal(makeRaw({ amount: 500 }))
    expect(result.value?.currency).toBe('INR')
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

describe('kapture-crm untransformDeal', () => {
  it('maps title', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.title).toBe('New Deal')
  })
})
