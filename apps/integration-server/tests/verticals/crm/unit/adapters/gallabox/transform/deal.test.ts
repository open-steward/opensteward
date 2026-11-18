import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  type RawGallaboxDeal,
} from '../../../../../../../src/verticals/crm/adapters/gallabox/transform/deal'

function makeRaw(overrides: Partial<RawGallaboxDeal> = {}): RawGallaboxDeal {
  return { id: 'd-1', ...overrides }
}

describe('gallabox transformDeal', () => {
  it('maps string id to string', () => {
    expect(transformDeal(makeRaw({ id: 'd-99' })).id).toBe('d-99')
  })

  it('maps numeric id to string', () => {
    expect(transformDeal(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps title when present', () => {
    expect(transformDeal(makeRaw({ title: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('falls back to empty string when title is absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('does not throw on minimal input', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'd-99' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
