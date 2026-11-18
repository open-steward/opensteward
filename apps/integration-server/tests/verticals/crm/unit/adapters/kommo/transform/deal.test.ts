import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawKommoDeal,
} from '../../../../../../../src/verticals/crm/adapters/kommo/transform/deal'

function makeRaw(overrides: Partial<RawKommoDeal> = {}): RawKommoDeal {
  return { id: 1, ...overrides }
}

describe('kommo transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('defaults title to empty string', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps price to value in USD', () => {
    const result = transformDeal(makeRaw({ price: 7500 }))
    expect(result.value).toEqual({ amount: 7500, currency: 'USD' })
  })

  it('maps status_id to stage_id', () => {
    expect(transformDeal(makeRaw({ status_id: 10 })).stage_id).toBe('10')
  })

  it('extracts contact from _embedded', () => {
    const result = transformDeal(makeRaw({ _embedded: { contacts: [{ id: 5 }] } }))
    expect(result.contact_ids).toEqual(['5'])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 3 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('kommo untransformDeal', () => {
  it('maps value.amount to price', () => {
    const result = untransformDeal({ value: { amount: 1000, currency: 'USD' } })
    expect(result.price).toBe(1000)
  })
})
