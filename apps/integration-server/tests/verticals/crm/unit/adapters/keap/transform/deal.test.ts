/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawKeapOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/deal'

/** Documented `RestV2Opportunity` example values. */
const DOC: RawKeapOpportunity = {
  id: '123',
  opportunity_title: 'New Business Deal',
  stage: { id: '1', name: 'Qualified' },
  contact: { id: '1001' },
  user: { id: '456' },
  estimated_close_time: '2024-04-15T00:00:00Z',
  projected_revenue_low: 5000,
  projected_revenue_high: 10000,
  created_time: '2024-01-10T08:00:00Z',
  last_updated_time: '2024-03-15T14:30:00Z',
}

describe('keap transformDeal', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = DealSchema.parse(transformDeal(DOC))
    expect(result).toMatchObject({
      id: '123',
      title: 'New Business Deal',
      stage_id: '1',
      stage: 'Qualified',
      contact_ids: ['1001'],
      owner_id: '456',
      close_date: '2024-04-15T00:00:00Z',
      created_at: '2024-01-10T08:00:00Z',
      updated_at: '2024-03-15T14:30:00Z',
    })
  })

  it('emits no value: Keap documents no currency for its revenue fields', () => {
    expect(transformDeal(DOC).value).toBeUndefined()
  })

  it('a bare record satisfies the schema', () => {
    expect(() =>
      DealSchema.parse(transformDeal({ id: '9', opportunity_title: 'Big Opp' })),
    ).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    expect(transformDeal(DOC).metadata).toBe(DOC)
  })
})

describe('keap untransformDeal', () => {
  it('maps title to opportunity_title', () => {
    expect(untransformDeal({ title: 'New Opp' }).opportunity_title).toBe('New Opp')
  })
})
