import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawSamdockDeal,
} from '../../../../../../../src/verticals/crm/adapters/samdock/transform/deal'

/**
 * The documented 200 example of GET /api/deals and GET /api/deals/{id}
 * (https://samdock.readme.io/reference/dealcontroller_browse.md), verbatim.
 */
function documentedDeal(overrides: Partial<RawSamdockDeal> = {}): RawSamdockDeal {
  return {
    ...(JSON.parse(
      '{ "_tenantID": "1", "_id": "1", "name": "John", "organization": {}, "positions": [ "1" ], "value": 0, "positionsEstimated": 0, "editor": {}, "stage": {}, "stakeholders": [ "Doe", "John" ], "contactPerson": "2", "budget": {}, "customerRequirement": "000-000", "timing": {}, "budgetHolder": "1", "decisionMaker": "1", "isArchived": true, "createdAt": 0, "updatedAt": 0 }',
    ) as RawSamdockDeal),
    ...overrides,
  }
}

describe('samdock transformDeal', () => {
  it('maps the documented Deal example and parses as a canonical Deal', () => {
    const raw = documentedDeal()
    const deal = DealSchema.parse(transformDeal(raw))
    expect(deal.id).toBe('1')
    expect(deal.title).toBe('John')
    expect(deal.metadata).toEqual(raw)
  })

  it('reports no money: the documented value carries no currency', () => {
    expect(transformDeal(documentedDeal({ value: 25000 })).value).toBeUndefined()
  })

  it('maps no stage, company, contact or timestamps from undocumented shapes', () => {
    const deal = transformDeal(documentedDeal({ createdAt: 1618999999 }))
    expect(deal.stage_id).toBeUndefined()
    expect(deal.company_id).toBeUndefined()
    expect(deal.contact_ids).toBeUndefined()
    expect(deal.created_at).toBeUndefined()
    expect(deal.updated_at).toBeUndefined()
  })

  it('throws on a deal with no name instead of inventing a title', () => {
    expect(() => transformDeal(documentedDeal({ name: undefined }))).toThrow(/name/)
  })

  it('throws on a deal with no _id instead of inventing one', () => {
    expect(() => transformDeal(documentedDeal({ _id: '' }))).toThrow(/_id/)
  })

  it('untransforms Deal to the existing write payload', () => {
    const out = untransformDeal({ title: 'New Contract', pipeline_id: 'p-1' })
    expect(out['name']).toBe('New Contract')
    expect(out['pipeline_id']).toBe('p-1')
  })
})
