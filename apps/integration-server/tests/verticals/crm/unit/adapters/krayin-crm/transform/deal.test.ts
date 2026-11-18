/**
 * Fixture: one LeadResource as krayin/rest-api emits it
 * (src/Http/Resources/V1/Lead/LeadResource.php), with the documented example
 * values of src/Docs/Models/Lead/Lead.php.
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  type RawKrayinLead,
} from '../../../../../../../src/verticals/crm/adapters/krayin-crm/transform/deal'

function doc(): RawKrayinLead {
  return {
    id: 1,
    title: 'Lead From Phone',
    description: 'Lead comes form via phone',
    lead_value: '$45,255,25',
    status: 1,
    lost_reason: 'Not interesting',
    closed_at: null,
    user: { id: 1 },
    person: { id: 5 },
    lead_products: [],
    lead_source_id: '1',
    lead_type_id: '1',
    lead_pipeline_id: '1',
    lead_pipeline_stage_id: '1',
    created_at: '2020-01-27 17:50:45',
    updated_at: '2020-01-27 17:50:45',
    expected_close_date: '2020-01-27 17:50:45',
  }
}

describe('krayin-crm transformDeal', () => {
  it('maps the documented resource and satisfies the canonical schema', () => {
    const out = DealSchema.parse(transformDeal(doc()))
    expect(out).toMatchObject({
      id: '1',
      title: 'Lead From Phone',
      pipeline_id: '1',
      stage_id: '1',
      contact_ids: ['5'],
      owner_id: '1',
      close_date: '2020-01-27T17:50:45.000Z',
      created_at: '2020-01-27T17:50:45.000Z',
    })
  })

  it('reads pipeline_id and stage_id from their own fields', () => {
    // The documented examples are both "1"; distinct values pin which is which.
    const out = DealSchema.parse(
      transformDeal({ ...doc(), lead_pipeline_id: '7', lead_pipeline_stage_id: '42' }),
    )
    expect(out.pipeline_id).toBe('7')
    expect(out.stage_id).toBe('42')
  })

  it('builds no Money: the lead carries no currency', () => {
    expect(transformDeal(doc()).value).toBeUndefined()
    expect(transformDeal({ ...doc(), lead_value: 100 }).value).toBeUndefined()
  })

  it('does not stringify the undocumented numeric status', () => {
    expect(transformDeal(doc()).status).toBeUndefined()
  })

  it('omits contact_ids when the person resource is empty', () => {
    const out = DealSchema.parse(transformDeal({ ...doc(), person: { id: null } }))
    expect(out.contact_ids).toBeUndefined()
  })

  it('throws instead of inventing a missing id or title', () => {
    expect(() => transformDeal({ ...doc(), id: undefined })).toThrow(/no id/)
    expect(() => transformDeal({ ...doc(), title: undefined })).toThrow(/title/)
  })
})
