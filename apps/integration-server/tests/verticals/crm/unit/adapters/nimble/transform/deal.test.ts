import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawNimbleDeal,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/deal'

function makeRaw(overrides: Partial<RawNimbleDeal> = {}): RawNimbleDeal {
  return { id: 'nd-1', ...overrides }
}

describe('nimble transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'nd-1' })).id).toBe('nd-1')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('falls back to id as title when name missing', () => {
    expect(transformDeal(makeRaw({ id: 'nd-5' })).title).toBe('nd-5')
  })

  it('parses numeric amount from value object', () => {
    const result = transformDeal(makeRaw({ value: { amount: 1000, currency: 'EUR' } }))
    expect(result.value).toEqual({ amount: 1000, currency: 'EUR' })
  })

  it('parses string amount', () => {
    const result = transformDeal(makeRaw({ value: { amount: '2500', currency: 'USD' } }))
    expect(result.value?.amount).toBe(2500)
  })

  it('maps contact_ids first element', () => {
    const result = transformDeal(makeRaw({ contact_ids: ['c-1', 'c-2'] }))
    expect(result.contact_ids).toEqual(['c-1'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'nd-1' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('nimble untransformDeal', () => {
  it('maps title to name', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
  })
})
