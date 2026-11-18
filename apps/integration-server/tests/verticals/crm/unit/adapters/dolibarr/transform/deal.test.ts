import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawDolibarrDeal } from '../../../../../../../src/verticals/crm/adapters/dolibarr/transform/deal'

function makeRaw(overrides: Partial<RawDolibarrDeal> = {}): RawDolibarrDeal {
  return { id: '1', title: 'Big Deal', ...overrides }
}

describe('dolibarr transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 7 })).id).toBe('7')
  })

  it('maps title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps status from statut', () => {
    expect(transformDeal(makeRaw({ statut: 2 })).status).toBe('won')
    expect(transformDeal(makeRaw({ statut: 3 })).status).toBe('lost')
  })

  it('maps value from total_ttc', () => {
    const result = transformDeal(makeRaw({ total_ttc: 500, multicurrency_code: 'EUR' }))
    expect(result.value?.amount).toBe(500)
    expect(result.value?.currency).toBe('EUR')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps title', () => {
    expect(untransformDeal({ title: 'Test' }).title).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 7 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
