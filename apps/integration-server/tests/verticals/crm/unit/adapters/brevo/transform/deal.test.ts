import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawBrevoDeal } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/deal'

// Fixture shaped from the vendor spec's Deal schema: the title lives at
// attributes.deal_name (there is no top-level `name`), and the contact /
// company links live at the top level as `linkedContactsIds` (numeric) and
// `linkedCompaniesIds` (string) — not under `attributes`.
function makeRaw(overrides: Partial<RawBrevoDeal> = {}): RawBrevoDeal {
  return {
    id: '63102c2fdfd15f658862dc76',
    attributes: {
      deal_name: 'Acme Q1 Expansion',
      deal_stage: 'stage_negotiation',
      amount: 5000,
      currency: 'EUR',
      pipeline: 'PIPELINE1',
      close_date: '2026-03-31T00:00:00.000+01:00',
      deal_owner: '6329d10b0b78ba3212e8bb26',
    },
    linkedContactsIds: [12, 32],
    linkedCompaniesIds: ['61f4b45d90124f66d70c33d0'],
    createdAt: '2026-01-15T09:30:00.000+01:00',
    updatedAt: '2026-02-01T14:20:00.000+01:00',
    ...overrides,
  }
}

describe('brevo transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('63102c2fdfd15f658862dc76')
  })

  it('maps title from attributes.deal_name', () => {
    const result = transformDeal(makeRaw())
    expect(result.title).toBe('Acme Q1 Expansion')
  })

  it('does not read a top-level `name` — the spec has none', () => {
    const result = transformDeal({ id: '1', name: 'wrong' } as unknown as RawBrevoDeal)
    expect(result.title).toBe('')
  })

  it('maps value from attributes.amount with EUR default', () => {
    const result = transformDeal(makeRaw({ attributes: { amount: 5000 } }))
    expect(result.value).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps stage_id from attributes.deal_stage', () => {
    const result = transformDeal(makeRaw())
    expect(result.stage_id).toBe('stage_negotiation')
  })

  it('maps owner_id from attributes.deal_owner', () => {
    const result = transformDeal(makeRaw())
    expect(result.owner_id).toBe('6329d10b0b78ba3212e8bb26')
  })

  it('maps company_id from the top-level linkedCompaniesIds, not attributes', () => {
    const result = transformDeal(makeRaw())
    expect(result.company_id).toBe('61f4b45d90124f66d70c33d0')
  })

  it('maps contact_ids from the top-level linkedContactsIds, stringified', () => {
    const result = transformDeal(makeRaw())
    expect(result.contact_ids).toEqual(['12', '32'])
  })

  it('does not read attributes.linked_company or attributes.linked_contacts_ids', () => {
    const result = transformDeal({
      id: '1',
      attributes: { linked_company: 'wrong', linked_contacts_ids: ['wrong'] },
    } as unknown as RawBrevoDeal)
    expect(result.company_id).toBeUndefined()
    expect(result.contact_ids).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal({ id: '1' })).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms title into attributes.deal_name', () => {
    const result = untransformDeal({ title: 'Deal A' })
    expect(result.attributes).toMatchObject({ deal_name: 'Deal A' })
    expect(result.name).toBeUndefined()
  })

  it('untransforms links into the top-level array fields', () => {
    const result = untransformDeal({ company_id: 'co_1', contact_ids: ['12', '32'] })
    expect(result.linkedCompaniesIds).toEqual(['co_1'])
    expect(result.linkedContactsIds).toEqual([12, 32])
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
