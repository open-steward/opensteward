import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawClarifyDeal,
} from '../../../../../../../src/verticals/crm/adapters/clarify/transform/deal'

function makeRaw(overrides: Partial<RawClarifyDeal> = {}): RawClarifyDeal {
  return { id: 'd-1', attributes: {}, ...overrides }
}

describe('clarify transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 'd-77' })).id).toBe('d-77')
  })

  it('maps name to title', () => {
    const result = transformDeal(makeRaw({ attributes: { name: 'Big Deal' } }))
    expect(result.title).toBe('Big Deal')
  })

  it('defaults title to empty string when name is absent', () => {
    const result = transformDeal(makeRaw({ attributes: {} }))
    expect(result.title).toBe('')
  })

  it('parses numeric amount into value object with USD currency', () => {
    const result = transformDeal(makeRaw({ attributes: { amount: 1500 } }))
    expect(result.value?.amount).toBe(1500)
    expect(result.value?.currency).toBe('USD')
  })

  it('parses string amount into value object', () => {
    const result = transformDeal(makeRaw({ attributes: { amount: '2500.50' } }))
    expect(result.value?.amount).toBe(2500.5)
    expect(result.value?.currency).toBe('USD')
  })

  it('returns undefined value when amount is absent', () => {
    const result = transformDeal(makeRaw({ attributes: {} }))
    expect(result.value).toBeUndefined()
  })

  it('returns undefined value when amount is a non-numeric string', () => {
    const result = transformDeal(makeRaw({ attributes: { amount: 'tbd' } }))
    expect(result.value).toBeUndefined()
  })

  it('maps stage and status', () => {
    const result = transformDeal(
      makeRaw({ attributes: { stage: 'Proposal', status: 'open' } }),
    )
    expect(result.stage).toBe('Proposal')
    expect(result.status).toBe('open')
  })

  it('maps pipeline_id', () => {
    const result = transformDeal(makeRaw({ attributes: { pipeline_id: 'pl-3' } }))
    expect(result.pipeline_id).toBe('pl-3')
  })

  it('maps company_id', () => {
    const result = transformDeal(makeRaw({ attributes: { company_id: 'co-5' } }))
    expect(result.company_id).toBe('co-5')
  })

  it('maps contact_ids when array is non-empty', () => {
    const result = transformDeal(
      makeRaw({ attributes: { contact_ids: ['c-1', 'c-2'] } }),
    )
    expect(result.contact_ids).toEqual(['c-1', 'c-2'])
  })

  it('returns undefined contact_ids when array is empty', () => {
    const result = transformDeal(makeRaw({ attributes: { contact_ids: [] } }))
    expect(result.contact_ids).toBeUndefined()
  })

  it('maps owner_id and close_date and timestamps', () => {
    const result = transformDeal(
      makeRaw({
        attributes: {
          owner_id: 'u-9',
          close_date: '2025-12-31',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-06-01T00:00:00Z',
        },
      }),
    )
    expect(result.owner_id).toBe('u-9')
    expect(result.close_date).toBe('2025-12-31')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
    expect(result.updated_at).toBe('2024-06-01T00:00:00Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'd-77' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('clarify untransformDeal', () => {
  it('wraps output in JSON:API data envelope with type "deal"', () => {
    const result = untransformDeal({ title: 'New Deal' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(result.data.type).toBe('deal')
    expect(result.data.attributes.name).toBe('New Deal')
  })

  it('maps value.amount to amount attribute', () => {
    const result = untransformDeal({ value: { amount: 3000, currency: 'USD' } }) as {
      data: { attributes: { amount: number } }
    }
    expect(result.data.attributes.amount).toBe(3000)
  })

  it('maps stage, close_date, status, pipeline_id, company_id, contact_ids, owner_id', () => {
    const result = untransformDeal({
      stage: 'Closed Won',
      close_date: '2025-12-31',
      status: 'won',
      pipeline_id: 'pl-1',
      company_id: 'co-2',
      contact_ids: ['c-3'],
      owner_id: 'u-4',
    }) as { data: { attributes: Record<string, unknown> } }
    const a = result.data.attributes
    expect(a.stage).toBe('Closed Won')
    expect(a.close_date).toBe('2025-12-31')
    expect(a.status).toBe('won')
    expect(a.pipeline_id).toBe('pl-1')
    expect(a.company_id).toBe('co-2')
    expect(a.contact_ids).toEqual(['c-3'])
    expect(a.owner_id).toBe('u-4')
  })
})
