import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawBoondManagerOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/boondmanager/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(
  attribs: Partial<RawBoondManagerOpportunity['attributes']> = {},
  rels: RawBoondManagerOpportunity['relationships'] = {},
): RawBoondManagerOpportunity {
  return {
    id: 'opp-1',
    type: 'opportunity',
    attributes: { ...attribs },
    relationships: rels,
  }
}

describe('boondmanager transformDeal', () => {
  it('maps id to string', () => {
    const raw: RawBoondManagerOpportunity = {
      id: '77',
      type: 'opportunity',
      attributes: {},
    }
    expect(transformDeal(raw).id).toBe('77')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw({ name: 'Acme Q1' })).title).toBe('Acme Q1')
  })

  it('defaults title to empty string when name absent', () => {
    expect(transformDeal(makeRaw()).title).toBe('')
  })

  it('maps numeric state to string stage', () => {
    expect(transformDeal(makeRaw({ state: 1 })).stage).toBe('1')
    expect(transformDeal(makeRaw({ state: 3 })).stage).toBe('3')
  })

  it('returns undefined stage when state absent', () => {
    expect(transformDeal(makeRaw()).stage).toBeUndefined()
  })

  it('maps company relationship to company_id', () => {
    const result = transformDeal(
      makeRaw({}, { company: { data: { id: 'co-33', type: 'company' } } }),
    )
    expect(result.company_id).toBe('co-33')
  })

  it('maps contact relationship to contact_ids array', () => {
    const result = transformDeal(
      makeRaw({}, { contact: { data: { id: 'c-99', type: 'contact' } } }),
    )
    expect(result.contact_ids).toEqual(['c-99'])
  })

  it('maps mainManager relationship to owner_id', () => {
    const result = transformDeal(
      makeRaw({}, { mainManager: { data: { id: 'u-7', type: 'staff' } } }),
    )
    expect(result.owner_id).toBe('u-7')
  })

  it('converts endDate to close_date', () => {
    const result = transformDeal(makeRaw({ endDate: '2026-03-31T00:00:00Z' }))
    expect(result.close_date).toMatch(/2026-03-31/)
  })

  it('converts creationDate to created_at', () => {
    const result = transformDeal(makeRaw({ creationDate: '2026-01-15T09:30:00Z' }))
    expect(result.created_at).toMatch(/2026-01-15/)
  })

  it('converts updateDate to updated_at', () => {
    const result = transformDeal(makeRaw({ updateDate: '2026-02-01T14:20:00Z' }))
    expect(result.updated_at).toMatch(/2026-02-01/)
  })

  it('passes DealSchema.parse without throwing', () => {
    const raw = makeRaw(
      {
        name: 'Acme Q1 Expansion',
        state: 2,
        endDate: '2026-03-31T00:00:00Z',
        creationDate: '2026-01-15T09:30:00Z',
        updateDate: '2026-02-01T14:20:00Z',
      },
      {
        company: { data: { id: 'co-33', type: 'company' } },
        contact: { data: { id: 'c-99', type: 'contact' } },
        mainManager: { data: { id: 'u-7', type: 'staff' } },
      },
    )
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('boondmanager untransformDeal', () => {
  it('maps title back to name', () => {
    expect(untransformDeal({ title: 'Acme Q1' })['name']).toBe('Acme Q1')
  })

  it('maps string stage back to numeric state', () => {
    expect(untransformDeal({ stage: '3' })['state']).toBe(3)
  })

  it('maps NaN stage back to NaN state', () => {
    // Number('non-numeric') === NaN
    expect(untransformDeal({ stage: 'Proposal' })['state']).toBeNaN()
  })

  it('round-trips title and state', () => {
    const raw = makeRaw({ name: 'Round-trip Deal', state: 2 })
    const canonical = transformDeal(raw)
    const back = untransformDeal(canonical)
    expect(back['name']).toBe('Round-trip Deal')
    expect(back['state']).toBe(2)
  })
})
