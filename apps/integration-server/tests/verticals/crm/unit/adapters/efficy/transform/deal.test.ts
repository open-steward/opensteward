/**
 * Fixture: the `example` values of `Opportunity_GET` in
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml
 * (response of GET /api/v1/opportunities and GET /api/v1/opportunities/{id}).
 */
import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawEfficyDeal,
} from '../../../../../../../src/verticals/crm/adapters/efficy/transform/deal'

const OPPORTUNITY_EXAMPLE: RawEfficyDeal = {
  external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
  crm_id: '00010QH200001PKZ',
  budget: 500.0,
  closing_date: '2025-01-15T09:35:54.603Z',
  created_by: 'JODOE',
  creation_date: '2024-11-14T13:31:40.033Z',
  currency: { external_id: 'EUR', crm_id: '00010QH200001PKC', name: 'Euro' },
  customer: {
    external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
    crm_id: '00010QH200001PKY',
    name: 'Org Corporation',
  },
  customer_contacts: [
    {
      external_id: 'b78f1d22-bd9e-4634-8c97-e99210844ae9',
      crm_id: '00010QH200001PKX',
      first_name: 'John',
      last_name: 'Doe',
      title: 'Mr.',
    } as { crm_id?: string; external_id?: string },
  ],
  description: 'This is an important Opportunity',
  last_update_date: '2024-11-18T13:31:40.033Z',
  last_updated_by: 'JODOE',
  lost_against: '00010QH200001PKZ',
  lost_reason: 'Lack of references',
  margin: 12.0,
  name: 'Golden Opportunity',
  nature: 'Cross-sell',
  responsible: { crm_id: '00010QH200001PKA', code: 'JODOE', name: 'John Doe' },
  status: '03Offer',
  success_probability: 12,
  unique_reference: 'xxxx-xxxx-xxxx-xxxx',
}

describe('efficy transformDeal', () => {
  it('maps the documented Opportunity_GET fields and parses as a canonical Deal', () => {
    const d = DealSchema.parse(transformDeal(OPPORTUNITY_EXAMPLE))
    expect(d.id).toBe('00010QH200001PKZ')
    expect(d.title).toBe('Golden Opportunity')
    expect(d.value).toEqual({ amount: 500, currency: 'EUR' })
    expect(d.status).toBe('03Offer')
    expect(d.company_id).toBe('00010QH200001PKY')
    expect(d.contact_ids).toEqual(['00010QH200001PKX'])
    expect(d.owner_id).toBe('00010QH200001PKA')
    expect(d.close_date).toBe('2025-01-15T09:35:54.603Z')
    expect(d.probability).toBe(12)
    expect(d.created_at).toBe('2024-11-14T13:31:40.033Z')
    expect(d.updated_at).toBe('2024-11-18T13:31:40.033Z')
    expect(d.metadata).toEqual(OPPORTUNITY_EXAMPLE)
  })

  it('omits the value when the budget or its currency is missing, never defaulting either', () => {
    const noCurrency = DealSchema.parse(
      transformDeal({ ...OPPORTUNITY_EXAMPLE, currency: undefined }),
    )
    expect(noCurrency.value).toBeUndefined()
    const noBudget = DealSchema.parse(transformDeal({ ...OPPORTUNITY_EXAMPLE, budget: undefined }))
    expect(noBudget.value).toBeUndefined()
    const notIso = DealSchema.parse(
      transformDeal({ ...OPPORTUNITY_EXAMPLE, currency: { external_id: 'Euro' } }),
    )
    expect(notIso.value).toBeUndefined()
  })

  it('keeps a zero budget as a real amount', () => {
    const d = DealSchema.parse(transformDeal({ ...OPPORTUNITY_EXAMPLE, budget: 0 }))
    expect(d.value).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('refuses a record with no crm_id or no name instead of inventing them', () => {
    expect(() => transformDeal({ name: 'x' })).toThrow(/crm_id/)
    expect(() => transformDeal({ crm_id: 'x' })).toThrow(/name/)
  })

  it('untransforms back to the write body', () => {
    const result = untransformDeal({ title: 'Deal A', status: 'open' })
    expect(result.NAME).toBe('Deal A')
    expect(result.STATUS).toBe('open')
  })
})
