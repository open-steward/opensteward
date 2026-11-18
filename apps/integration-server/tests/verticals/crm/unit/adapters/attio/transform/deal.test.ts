import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawAttioDeal } from '../../../../../../../src/verticals/crm/adapters/attio/transform/deal'

function makeRaw(overrides: Partial<RawAttioDeal> = {}): RawAttioDeal {
  return {
    id: { record_id: 'deal1' },
    values: { name: [{ value: 'Big Deal', attribute_type: 'text' }] },
    ...overrides,
  }
}

describe('attio transformDeal', () => {
  it('maps id from record_id', () => {
    expect(transformDeal(makeRaw()).id).toBe('deal1')
  })

  it('maps title from values.name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from currency value', () => {
    const raw = makeRaw({
      values: { value: [{ currency_value: 1000, currency_code: 'EUR', attribute_type: 'currency' }] },
    })
    const result = transformDeal(raw)
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal returns data.values wrapper', () => {
    const result = untransformDeal({ title: 'Test' }) as { data: { values: Record<string, unknown> } }
    expect(result.data.values['name']).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
