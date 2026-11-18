import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawCloseOpportunity } from '../../../../../../../src/verticals/crm/adapters/close/transform/deal'

function makeRaw(overrides: Partial<RawCloseOpportunity> = {}): RawCloseOpportunity {
  return { id: 'opp1', ...overrides }
}

describe('close transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('opp1')
  })

  it('maps title from note', () => {
    expect(transformDeal(makeRaw({ note: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('converts value from cents', () => {
    const result = transformDeal(makeRaw({ value: 5000, value_currency: 'USD' }))
    expect(result.value?.amount).toBe(50)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps status: active → open', () => {
    expect(transformDeal(makeRaw({ status: 'active' })).status).toBe('open')
    expect(transformDeal(makeRaw({ status: 'won' })).status).toBe('won')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal converts status open → active', () => {
    const result = untransformDeal({ status: 'open' })
    expect(result.status).toBe('active')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
