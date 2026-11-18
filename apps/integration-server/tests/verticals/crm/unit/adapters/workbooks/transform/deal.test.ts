import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawWorkbooksOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawWorkbooksOpportunity> = {}): RawWorkbooksOpportunity {
  return { id: 'opp-1', ...overrides }
}

describe('workbooks transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformDeal(makeRaw({ id: 'opp-99' })).id).toBe('opp-99')
  })

  it('maps description to title', () => {
    expect(transformDeal(makeRaw({ description: 'Acme Q1 Expansion' })).title).toBe(
      'Acme Q1 Expansion',
    )
  })

  it('defaults title to empty string when description is absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('converts major-unit float to minor-unit integer', () => {
    // 1250.00 GBP => 125000 pence
    const result = transformDeal(makeRaw({ document_value: 1250.0, document_currency: 'GBP' }))
    expect(result.value?.amount).toBe(125000)
    expect(result.value?.currency).toBe('GBP')
  })

  it('handles string document_value', () => {
    const result = transformDeal(makeRaw({ document_value: '99.99', document_currency: 'USD' }))
    expect(result.value?.amount).toBe(9999)
    expect(result.value?.currency).toBe('USD')
  })

  it('uppercases currency code', () => {
    const result = transformDeal(makeRaw({ document_value: 100, document_currency: 'eur' }))
    expect(result.value?.currency).toBe('EUR')
  })

  it('sets value to undefined when document_currency is absent', () => {
    const result = transformDeal(makeRaw({ document_value: 100 }))
    expect(result.value).toBeUndefined()
  })

  it('sets value to undefined when document_value is absent', () => {
    const result = transformDeal(makeRaw({ document_currency: 'USD' }))
    expect(result.value).toBeUndefined()
  })

  it('maps stage_name to stage', () => {
    expect(transformDeal(makeRaw({ stage_name: 'Negotiation' })).stage).toBe('Negotiation')
  })

  it('maps probability as number', () => {
    expect(transformDeal(makeRaw({ probability: 60 })).probability).toBe(60)
    expect(transformDeal(makeRaw({ probability: '75' })).probability).toBe(75)
  })

  it('sets probability to undefined when absent', () => {
    expect(transformDeal(makeRaw()).probability).toBeUndefined()
  })

  it('maps close_date preferring close_date over document_date', () => {
    const result = transformDeal(
      makeRaw({
        close_date: '2026-03-31T00:00:00.000Z',
        document_date: '2026-01-01T00:00:00.000Z',
      }),
    )
    expect(result.close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('falls back to document_date when close_date is absent', () => {
    const result = transformDeal(makeRaw({ document_date: '2026-01-01T00:00:00.000Z' }))
    expect(result.close_date).toBe('2026-01-01T00:00:00.000Z')
  })

  it('maps opportunity_contact_ids to contact_ids as strings', () => {
    const result = transformDeal(makeRaw({ opportunity_contact_ids: [1, 'c-2', 3] }))
    expect(result.contact_ids).toEqual(['1', 'c-2', '3'])
  })

  it('sets contact_ids to undefined when opportunity_contact_ids is absent', () => {
    expect(transformDeal(makeRaw()).contact_ids).toBeUndefined()
  })

  it('maps assigned_to_id to owner_id as string', () => {
    expect(transformDeal(makeRaw({ assigned_to_id: 7 })).owner_id).toBe('7')
  })

  it('maps created_at and updated_at', () => {
    const result = transformDeal(
      makeRaw({
        created_at: '2026-01-15T09:30:00.000Z',
        updated_at: '2026-02-01T14:20:00.000Z',
      }),
    )
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ description: 'My Deal' })
    const result = transformDeal(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes DealSchema.parse without throwing', () => {
    const raw = makeRaw({
      description: 'Acme Q1 Expansion',
      document_value: 1250.0,
      document_currency: 'GBP',
      stage_name: 'Negotiation',
      probability: 60,
      close_date: '2026-03-31T00:00:00.000Z',
      opportunity_contact_ids: ['c-1'],
      assigned_to_id: 'u-1',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('workbooks untransformDeal', () => {
  it('maps title back to description', () => {
    expect(untransformDeal({ title: 'Big Deal' }).description).toBe('Big Deal')
  })

  it('converts minor-unit amount back to major units', () => {
    // 125000 pence => 1250.00 GBP
    const result = untransformDeal({ value: { amount: 125000, currency: 'GBP' } })
    expect(result.document_value).toBe(1250)
    expect(result.document_currency).toBe('GBP')
  })

  it('maps stage back to stage_name', () => {
    expect(untransformDeal({ stage: 'Negotiation' }).stage_name).toBe('Negotiation')
  })

  it('maps probability back', () => {
    expect(untransformDeal({ probability: 60 }).probability).toBe(60)
  })

  it('maps close_date back', () => {
    expect(untransformDeal({ close_date: '2026-03-31T00:00:00.000Z' }).close_date).toBe(
      '2026-03-31T00:00:00.000Z',
    )
  })

  it('omits fields not provided', () => {
    const result = untransformDeal({})
    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('document_value')
    expect(result).not.toHaveProperty('stage_name')
  })

  it('round-trips title, value, and stage', () => {
    const raw = makeRaw({
      description: 'Round-trip Deal',
      document_value: 500,
      document_currency: 'USD',
      stage_name: 'Prospecting',
    })
    const canonical = transformDeal(raw)
    const back = untransformDeal(canonical)
    expect(back.description).toBe('Round-trip Deal')
    expect(back.document_value).toBe(500)
    expect(back.document_currency).toBe('USD')
    expect(back.stage_name).toBe('Prospecting')
  })
})
