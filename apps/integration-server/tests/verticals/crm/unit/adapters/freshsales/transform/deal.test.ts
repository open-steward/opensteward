import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawFreshsalesDeal,
} from '../../../../../../../src/verticals/crm/adapters/freshsales/transform/deal'

function makeRaw(overrides: Partial<RawFreshsalesDeal> = {}): RawFreshsalesDeal {
  return { id: 5, name: 'Big Deal', ...overrides }
}

describe('freshsales transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps amount and currency_symbol to value', () => {
    const result = transformDeal(makeRaw({ amount: 1000, currency_symbol: 'EUR' }))
    expect(result.value).toEqual({ amount: 1000, currency: 'EUR' })
  })

  it('defaults currency to USD when currency_symbol missing', () => {
    const result = transformDeal(makeRaw({ amount: 500 }))
    expect(result.value?.currency).toBe('USD')
  })

  it('maps contact_ids to string array', () => {
    const result = transformDeal(makeRaw({ contact_ids: [1, 2] }))
    expect(result.contact_ids).toEqual(['1', '2'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 5 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('freshsales untransformDeal', () => {
  it('maps title to name', () => {
    const result = untransformDeal({ title: 'New Deal' })
    expect(result.name).toBe('New Deal')
  })
})
