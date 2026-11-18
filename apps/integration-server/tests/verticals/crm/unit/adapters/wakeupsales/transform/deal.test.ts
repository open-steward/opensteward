import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawWakeupsalesDeal } from '../../../../../../../src/verticals/crm/adapters/wakeupsales/transform/deal'

function makeRaw(overrides: Partial<RawWakeupsalesDeal> = {}): RawWakeupsalesDeal {
  return { id: 'WUD1', ...overrides }
}

describe('wakeupsales transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw()).id).toBe('WUD1')
  })

  it('uses title field for title', () => {
    expect(transformDeal(makeRaw({ title: 'A Deal' })).title).toBe('A Deal')
  })

  it('falls back to name field when title is absent', () => {
    expect(transformDeal(makeRaw({ name: 'Deal B' })).title).toBe('Deal B')
  })

  it('maps amount to value.amount with INR default currency', () => {
    const result = transformDeal(makeRaw({ amount: 500 }))
    expect(result.value?.amount).toBe(500)
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
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('wakeupsales untransformDeal', () => {
  it('maps title', () => {
    expect(untransformDeal({ title: 'Deal X' }).title).toBe('Deal X')
  })
})
