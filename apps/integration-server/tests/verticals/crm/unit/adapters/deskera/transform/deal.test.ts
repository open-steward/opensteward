import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal } from '../../../../../../../src/verticals/crm/adapters/deskera/transform/deal'

describe('deskera transformDeal', () => {
  it('maps deal to canonical Deal', () => {
    const raw = {
      id: 'deal-1',
      title: 'Enterprise License',
      amount: 50000,
      stageId: 'stage-2',
      pipelineId: 'pipe-1',
      contactId: 'c-100',
      companyId: 'o-200',
      ownerId: 'u-5',
      // Deskera's Deal API always returns closing_date as a full ISO 8601
      // datetime with milliseconds and a Z offset (e.g. "2020-06-23T07:30:26.438Z"
      // per https://deskera.github.io/Developer-Documentation/docs/sales/dealsapi/),
      // never a bare calendar date. Note: the docs name the key `closing_date`
      // (snake_case) while this transform reads `closeDate` (camelCase), a
      // naming mismatch across the whole Deskera CRM adapter — so this
      // citation is indirect, and the transform also runs the field through
      // `toIsoDatetime()` defensively.
      closeDate: '2024-12-31T14:30:00.438Z',
    }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('deal-1')
    expect(deal.title).toBe('Enterprise License')
    expect(deal.value?.amount).toBe(50000)
    expect(deal.stage_id).toBe('stage-2')
    expect(deal.pipeline_id).toBe('pipe-1')
    expect(deal.company_id).toBe('o-200')
    expect(deal.close_date).toBe('2024-12-31T14:30:00.438Z')
    expect(deal.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = {
      id: 'deal-1',
      title: 'Enterprise License',
      amount: 50000,
      stageId: 'stage-2',
      pipelineId: 'pipe-1',
      contactId: 'c-100',
      companyId: 'o-200',
      ownerId: 'u-5',
      closeDate: '2024-12-31T14:30:00.438Z',
    }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
