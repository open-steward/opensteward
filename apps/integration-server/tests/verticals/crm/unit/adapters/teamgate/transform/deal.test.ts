import { describe, it, expect } from 'vitest'
import {
  transformDeal,
  untransformDeal,
  type RawTeamgateDeal,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/deal'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'

function makeRaw(overrides: Partial<RawTeamgateDeal> = {}): RawTeamgateDeal {
  return { id: 1, ...overrides }
}

describe('teamgate transformDeal', () => {
  it('maps id to string', () => {
    expect(transformDeal(makeRaw({ id: 10 })).id).toBe('10')
  })

  it('maps name to title', () => {
    const result = transformDeal(makeRaw({ name: 'Enterprise Deal' }))
    expect(result.title).toBe('Enterprise Deal')
  })

  it('falls back to id string when name absent', () => {
    const result = transformDeal(makeRaw({ id: 42, name: undefined }))
    expect(result.title).toBe('42')
  })

  it('converts priceValue from major units to minor units', () => {
    const result = transformDeal(makeRaw({ priceValue: 1200.5, priceCurrency: 'EUR' }))
    expect(result.value?.amount).toBe(120050)
    expect(result.value?.currency).toBe('EUR')
  })

  it('prefers priceBaseValue over priceValue', () => {
    const result = transformDeal(
      makeRaw({
        priceBaseValue: 2000,
        priceBaseCurrency: 'GBP',
        priceValue: 1000,
        priceCurrency: 'USD',
      }),
    )
    expect(result.value?.amount).toBe(200000)
    expect(result.value?.currency).toBe('GBP')
  })

  it('lowercases statusName for status', () => {
    const result = transformDeal(makeRaw({ statusName: 'Open' }))
    expect(result.status).toBe('open')
  })

  it('maps pipelineId to pipeline_id', () => {
    const result = transformDeal(makeRaw({ pipelineId: 5 }))
    expect(result.pipeline_id).toBe('5')
  })

  it('maps stageId to stage_id', () => {
    const result = transformDeal(makeRaw({ stageId: 3 }))
    expect(result.stage_id).toBe('3')
  })

  it('maps stageName to stage', () => {
    const result = transformDeal(makeRaw({ stageName: 'Negotiation' }))
    expect(result.stage).toBe('Negotiation')
  })

  it('maps stageProbability to probability', () => {
    const result = transformDeal(makeRaw({ stageProbability: 75 }))
    expect(result.probability).toBe(75)
  })

  it('wraps buyerId into contact_ids array', () => {
    const result = transformDeal(makeRaw({ buyerId: 11 }))
    expect(result.contact_ids).toEqual(['11'])
  })

  it('maps ownerId to owner_id', () => {
    const result = transformDeal(makeRaw({ ownerId: 7 }))
    expect(result.owner_id).toBe('7')
  })

  it('converts estimatedClosureDate to ISO', () => {
    const result = transformDeal(makeRaw({ estimatedClosureDate: '2026-03-31T00:00:00.000Z' }))
    expect(result.close_date).toBe('2026-03-31T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('passes DealSchema validation', () => {
    const raw = makeRaw({
      id: 10,
      name: 'Enterprise Deal',
      priceValue: 5000,
      priceCurrency: 'USD',
      statusName: 'Open',
      pipelineId: 5,
      stageId: 3,
      stageName: 'Negotiation',
      stageProbability: 60,
      buyerId: 11,
      ownerId: 7,
      estimatedClosureDate: '2026-03-31T00:00:00.000Z',
      createdTime: '2026-01-15T09:30:00.000Z',
      updatedTime: '2026-02-01T14:20:00.000Z',
    })
    expect(() => DealSchema.parse(transformDeal(raw))).not.toThrow()
  })
})

describe('teamgate untransformDeal', () => {
  it('maps title back to name', () => {
    const result = untransformDeal({ title: 'Enterprise Deal' })
    expect(result.name).toBe('Enterprise Deal')
  })

  it('converts amount from minor units back to major units', () => {
    const result = untransformDeal({ value: { amount: 120050, currency: 'EUR' } })
    expect(result.priceValue).toBe(1200.5)
    expect(result.priceCurrency).toBe('EUR')
  })

  it('maps pipeline_id back to pipelineId', () => {
    const result = untransformDeal({ pipeline_id: '5' })
    expect(result.pipelineId).toBe('5')
  })

  it('maps stage_id back to stageId', () => {
    const result = untransformDeal({ stage_id: '3' })
    expect(result.stageId).toBe('3')
  })

  it('omits undefined fields', () => {
    const result = untransformDeal({})
    expect(Object.keys(result)).toHaveLength(0)
  })
})
