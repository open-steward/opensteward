import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/deal'

describe('rd-station-crm transformDeal', () => {
  it('maps deal to canonical Deal', () => {
    const raw = { _id: 'deal-abc', name: 'Contrato Grande', amount_montly: 10000, deal_stage: { _id: 'stage-1' }, contact_id: 'mongo-abc', organization_id: 'org-xyz' }
    const deal = transformDeal(raw)
    expect(deal.id).toBe('deal-abc')
    expect(deal.title).toBe('Contrato Grande')
    expect(deal.value?.amount).toBe(10000)
    expect(deal.stage_id).toBe('stage-1')
    expect(deal.contact_ids).toEqual(['mongo-abc'])
    expect(deal.company_id).toBe('org-xyz')
    expect(deal.metadata).toBe(raw)
  })

  it('untransforms deal data', () => {
    const out = untransformDeal({ title: 'Novo Negócio', stage_id: 'stage-2' })
    expect(out.name).toBe('Novo Negócio')
    expect((out.deal_stage as { _id: string })._id).toBe('stage-2')
  })

  it('produces canonical output that satisfies the schema', () => {
    const raw = { _id: 'deal-abc', name: 'Contrato Grande', amount_montly: 10000, deal_stage: { _id: 'stage-1' }, contact_id: 'mongo-abc', organization_id: 'org-xyz' }
    const result = transformDeal(raw)
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
