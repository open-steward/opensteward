import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawGoldVisionOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/deal'

function makeRaw(overrides: Partial<RawGoldVisionOpportunity> = {}): RawGoldVisionOpportunity {
  return { id: 1, ...overrides }
}

describe('gold-vision transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformDeal(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps summary to title', () => {
    expect(transformDeal(makeRaw({ summary: 'Big Deal' })).title).toBe('Big Deal')
  })

  it('returns empty string title when summary absent', () => {
    expect(transformDeal(makeRaw({ summary: undefined })).title).toBe('')
  })

  it('builds value object from totalValue and currency', () => {
    const result = transformDeal(makeRaw({ totalValue: 100, currency: 'USD' }))
    expect(result.value).toEqual({ amount: 100, currency: 'USD' })
  })

  it('defaults currency to GBP when totalValue present but currency absent', () => {
    const result = transformDeal(makeRaw({ totalValue: 500, currency: undefined }))
    expect(result.value).toEqual({ amount: 500, currency: 'GBP' })
  })

  it('returns undefined value when totalValue absent', () => {
    expect(transformDeal(makeRaw({ totalValue: undefined })).value).toBeUndefined()
  })

  it('returns undefined value when totalValue is NaN string', () => {
    expect(transformDeal(makeRaw({ totalValue: 'bad' })).value).toBeUndefined()
  })

  it('maps state to status', () => {
    expect(transformDeal(makeRaw({ state: 'OPEN' })).status).toBe('OPEN')
  })

  it('returns undefined status when absent', () => {
    expect(transformDeal(makeRaw({ state: undefined })).status).toBeUndefined()
  })

  it('maps plain string forecastStage to stage', () => {
    expect(transformDeal(makeRaw({ forecastStage: 'Proposal' })).stage).toBe('Proposal')
  })

  it('resolves object forecastStage to its summary', () => {
    expect(transformDeal(makeRaw({ forecastStage: { summary: 'Proposal' } })).stage).toBe(
      'Proposal',
    )
  })

  it('returns undefined stage when absent', () => {
    expect(transformDeal(makeRaw({ forecastStage: undefined })).stage).toBeUndefined()
  })

  it('maps forecastStageId to stage_id string', () => {
    expect(transformDeal(makeRaw({ forecastStageId: 3 })).stage_id).toBe('3')
  })

  it('returns undefined stage_id when absent', () => {
    expect(transformDeal(makeRaw({ forecastStageId: undefined })).stage_id).toBeUndefined()
  })

  it('maps pipelineId to pipeline_id string', () => {
    expect(transformDeal(makeRaw({ pipelineId: 2 })).pipeline_id).toBe('2')
  })

  it('returns undefined pipeline_id when absent', () => {
    expect(transformDeal(makeRaw({ pipelineId: undefined })).pipeline_id).toBeUndefined()
  })

  it('maps accountId to company_id string', () => {
    expect(transformDeal(makeRaw({ accountId: 10 })).company_id).toBe('10')
  })

  it('returns undefined company_id when absent', () => {
    expect(transformDeal(makeRaw({ accountId: undefined })).company_id).toBeUndefined()
  })

  it('maps contactIds array to contact_ids strings', () => {
    expect(transformDeal(makeRaw({ contactIds: [1, 2] })).contact_ids).toEqual(['1', '2'])
  })

  it('returns undefined contact_ids when empty array', () => {
    expect(transformDeal(makeRaw({ contactIds: [] })).contact_ids).toBeUndefined()
  })

  it('returns undefined contact_ids when absent', () => {
    expect(transformDeal(makeRaw({ contactIds: undefined })).contact_ids).toBeUndefined()
  })

  it('maps ownerId to owner_id string', () => {
    expect(transformDeal(makeRaw({ ownerId: 5 })).owner_id).toBe('5')
  })

  it('returns undefined owner_id when absent', () => {
    expect(transformDeal(makeRaw({ ownerId: undefined })).owner_id).toBeUndefined()
  })

  it('maps numeric probability through', () => {
    expect(transformDeal(makeRaw({ probability: 75 })).probability).toBe(75)
  })

  it('parses string probability to number', () => {
    expect(transformDeal(makeRaw({ probability: '75' })).probability).toBe(75)
  })

  it('returns undefined probability when NaN string', () => {
    expect(transformDeal(makeRaw({ probability: 'bad' })).probability).toBeUndefined()
  })

  it('returns undefined probability when absent', () => {
    expect(transformDeal(makeRaw({ probability: undefined })).probability).toBeUndefined()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 42 }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision untransformDeal', () => {
  it('maps title to summary', () => {
    expect(untransformDeal({ title: 'Big Deal' })).toMatchObject({ summary: 'Big Deal' })
  })

  it('maps value.amount to totalValue', () => {
    expect(untransformDeal({ value: { amount: 100, currency: 'USD' } })).toMatchObject({
      totalValue: 100,
    })
  })

  it('maps value.currency to currency', () => {
    expect(untransformDeal({ value: { amount: 100, currency: 'USD' } })).toMatchObject({
      currency: 'USD',
    })
  })

  it('maps status to state', () => {
    expect(untransformDeal({ status: 'OPEN' })).toMatchObject({ state: 'OPEN' })
  })

  it('maps stage_id to forecastStageId', () => {
    expect(untransformDeal({ stage_id: '3' })).toMatchObject({ forecastStageId: '3' })
  })

  it('maps pipeline_id to pipelineId', () => {
    expect(untransformDeal({ pipeline_id: '2' })).toMatchObject({ pipelineId: '2' })
  })

  it('maps company_id to accountId', () => {
    expect(untransformDeal({ company_id: '10' })).toMatchObject({ accountId: '10' })
  })

  it('maps owner_id to ownerId', () => {
    expect(untransformDeal({ owner_id: '5' })).toMatchObject({ ownerId: '5' })
  })

  it('maps close_date to forecastDate', () => {
    expect(untransformDeal({ close_date: '2024-12-31T00:00:00.000Z' })).toMatchObject({
      forecastDate: '2024-12-31T00:00:00.000Z',
    })
  })

  it('maps probability to probability', () => {
    expect(untransformDeal({ probability: 75 })).toMatchObject({ probability: 75 })
  })

  it('omits undefined fields', () => {
    const result = untransformDeal({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
