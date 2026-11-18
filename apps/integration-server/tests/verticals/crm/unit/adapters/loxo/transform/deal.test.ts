import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawLoxoDeal,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawLoxoDeal> = {}): RawLoxoDeal {
  return { id: 1, ...overrides }
}

describe('loxo transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Q1 Deal' })).title).toBe('Q1 Deal')
  })

  it('maps numeric amount to value with USD currency', () => {
    const result = transformDeal(makeRaw({ amount: 5000 }))
    expect(result.value?.amount).toBe(5000)
    expect(result.value?.currency).toBe('USD')
  })

  it('maps string amount to value', () => {
    const result = transformDeal(makeRaw({ amount: '2500' }))
    expect(result.value?.amount).toBe(2500)
  })

  it('returns undefined value for null amount', () => {
    expect(transformDeal(makeRaw({ amount: null })).value).toBeUndefined()
  })

  it('maps pipeline_stage_id to stage_id', () => {
    expect(transformDeal(makeRaw({ pipeline_stage_id: 3 })).stage_id).toBe('3')
  })

  it('maps pipeline_stage.name to stage', () => {
    const result = transformDeal(makeRaw({ pipeline_stage: { id: 3, name: 'Proposal' } }))
    expect(result.stage).toBe('Proposal')
  })

  it('maps workflow_id to pipeline_id', () => {
    expect(transformDeal(makeRaw({ workflow_id: 7 })).pipeline_id).toBe('7')
  })

  it('maps company_id', () => {
    expect(transformDeal(makeRaw({ company_id: 20 })).company_id).toBe('20')
  })

  it('maps person_id to contact_ids array', () => {
    expect(transformDeal(makeRaw({ person_id: 15 })).contact_ids).toEqual(['15'])
  })

  it('maps owner_id', () => {
    expect(transformDeal(makeRaw({ owner_id: 5 })).owner_id).toBe('5')
  })

  it('maps closes_at to close_date', () => {
    const result = transformDeal(makeRaw({ closes_at: '2024-12-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2024-12-31T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw: RawLoxoDeal = {
      id: 1,
      name: 'Acme Q1 Expansion',
      amount: 10000,
      closes_at: '2024-03-31T00:00:00.000Z',
      workflow_id: 7,
      pipeline_stage_id: 3,
      pipeline_stage: { id: 3, name: 'Proposal' },
      company_id: 20,
      person_id: 15,
      owner_id: 5,
      created_at: '2024-01-15T09:30:00.000Z',
      updated_at: '2024-02-01T14:20:00.000Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('loxo untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Q1 Deal' }).name).toBe('Q1 Deal')
  })

  it('maps value.amount to amount', () => {
    expect(untransformDeal({ value: { amount: 5000, currency: 'USD' } }).amount).toBe(5000)
  })

  it('maps close_date to closes_at', () => {
    expect(untransformDeal({ close_date: '2024-12-31T00:00:00.000Z' }).closes_at).toBe(
      '2024-12-31T00:00:00.000Z',
    )
  })

  it('maps pipeline_id to workflow_id', () => {
    expect(untransformDeal({ pipeline_id: '7' }).workflow_id).toBe('7')
  })
})
