import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawClozeProject,
} from '../../../../../../../src/verticals/crm/adapters/cloze/transform/deal'

function makeRaw(overrides: Partial<RawClozeProject> = {}): RawClozeProject {
  return { ...overrides }
}

describe('cloze transformDeal', () => {
  it('maps id from direct field', () => {
    expect(transformDeal(makeRaw({ direct: 'deal-abc' })).id).toBe('deal-abc')
  })

  it('falls back to id field when direct is absent', () => {
    expect(transformDeal(makeRaw({ id: 'deal-xyz' })).id).toBe('deal-xyz')
  })

  it('returns empty string id when both direct and id are absent', () => {
    expect(transformDeal(makeRaw()).id).toBe('')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Enterprise Contract' })).title).toBe('Enterprise Contract')
  })

  it('returns empty string title when name is absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps stage', () => {
    expect(transformDeal(makeRaw({ stage: 'negotiation' })).stage).toBe('negotiation')
  })

  it('converts major unit value to minor units (cents)', () => {
    const result = transformDeal(makeRaw({ value: 15000 }))
    expect(result.value?.amount).toBe(1500000)
    expect(result.value?.currency).toBe('USD')
  })

  it('converts fractional major units to minor units (cents)', () => {
    const result = transformDeal(makeRaw({ value: 0.5 }))
    expect(result.value?.amount).toBe(50)
  })

  it('converts string numeric value to minor units', () => {
    const result = transformDeal(makeRaw({ value: '250' }))
    expect(result.value?.amount).toBe(25000)
  })

  it('sets value to undefined when value field is absent', () => {
    expect(transformDeal(makeRaw()).value).toBeUndefined()
  })

  it('maps created_at from ISO string in created field', () => {
    const result = transformDeal(makeRaw({ created: '2024-02-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-02-01T00:00:00.000Z')
  })

  it('maps created_at from createdDate when created is absent', () => {
    const result = transformDeal(makeRaw({ createdDate: '2024-05-15T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-05-15T00:00:00.000Z')
  })

  it('prefers created over createdDate', () => {
    const result = transformDeal(
      makeRaw({ created: '2024-01-01T00:00:00.000Z', createdDate: '2023-12-31T00:00:00.000Z' }),
    )
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('maps updated_at from ISO string in modified field', () => {
    const result = transformDeal(makeRaw({ modified: '2024-09-10T11:00:00.000Z' }))
    expect(result.updated_at).toBe('2024-09-10T11:00:00.000Z')
  })

  it('sets timestamps to undefined when absent', () => {
    const result = transformDeal(makeRaw())
    expect(result.created_at).toBeUndefined()
    expect(result.updated_at).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ direct: 'deal-abc' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('cloze untransformDeal', () => {
  it('maps title to name', () => {
    const result = untransformDeal({ title: 'New Partnership' })
    expect(result.name).toBe('New Partnership')
  })

  it('maps stage', () => {
    const result = untransformDeal({ stage: 'closed-won' })
    expect(result.stage).toBe('closed-won')
  })

  it('converts minor unit amount back to major units', () => {
    const result = untransformDeal({ value: { amount: 1500000, currency: 'USD' } })
    expect(result.value).toBe(15000)
  })

  it('converts small minor unit amount back to major units', () => {
    const result = untransformDeal({ value: { amount: 50, currency: 'USD' } })
    expect(result.value).toBe(0.5)
  })

  it('omits fields not present in input', () => {
    const result = untransformDeal({})
    expect(result.name).toBeUndefined()
    expect(result.stage).toBeUndefined()
    expect(result.value).toBeUndefined()
  })
})
