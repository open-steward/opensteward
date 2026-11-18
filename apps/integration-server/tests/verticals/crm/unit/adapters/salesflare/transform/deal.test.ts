import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawSalesflareDeal,
} from '../../../../../../../src/verticals/crm/adapters/salesflare/transform/deal'

function makeRaw(overrides: Partial<RawSalesflareDeal> = {}): RawSalesflareDeal {
  return { id: 1, ...overrides }
}

describe('salesflare transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw({ name: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('maps value and currency', () => {
    const result = transformDeal(makeRaw({ value: 10000, currency: 'EUR' }))
    expect(result.value?.amount).toBe(10000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps pipeline_id from pipeline.id', () => {
    const result = transformDeal(makeRaw({ pipeline: { id: 2 } }))
    expect(result.pipeline_id).toBe('2')
  })

  it('maps contact_ids from contacts array', () => {
    const result = transformDeal(makeRaw({ contacts: [{ id: 1 }, { id: 2 }] }))
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

describe('salesflare untransformDeal', () => {
  it('maps pipeline_id to pipeline object', () => {
    const result = untransformDeal({ pipeline_id: '3' })
    expect((result.pipeline as Record<string, unknown>)?.['id']).toBe(3)
  })
})
