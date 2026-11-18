import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawEspoCrmOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/deal'

function makeRaw(overrides: Partial<RawEspoCrmOpportunity> = {}): RawEspoCrmOpportunity {
  return { id: '1', name: 'Big Deal', ...overrides }
}

describe('espocrm transformDeal', () => {
  it('maps id', () => {
    const result = transformDeal(makeRaw())
    expect(result.id).toBe('1')
  })

  it('maps title from name', () => {
    const result = transformDeal(makeRaw({ name: 'Big Deal' }))
    expect(result.title).toBe('Big Deal')
  })

  it('maps value from amount and the documented amountCurrency', () => {
    const result = transformDeal(makeRaw({ amount: 5000, amountCurrency: 'USD' }))
    expect(DealSchema.parse(result).value).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('omits value rather than assuming a currency when amountCurrency is absent', () => {
    const result = transformDeal(makeRaw({ amount: 5000 }))
    expect(result.value).toBeUndefined()
  })

  it('reads the documented UTC datetime and date formats as ISO 8601', () => {
    const result = DealSchema.parse(
      transformDeal(
        makeRaw({
          createdAt: '2026-11-29 12:34:56',
          modifiedAt: '2026-11-30 01:02:03',
          closeDate: '2026-12-31',
        }),
      ),
    )
    expect(result.created_at).toBe('2026-11-29T12:34:56Z')
    expect(result.updated_at).toBe('2026-11-30T01:02:03Z')
    expect(result.close_date).toBe('2026-12-31T00:00:00Z')
  })

  it('maps status from stage', () => {
    const result = transformDeal(makeRaw({ stage: 'Prospecting' }))
    expect(result.status).toBe('Prospecting')
  })

  it('maps stage_id and pipeline_id from the Pipeline Stage and Pipeline links, never from the stage label', () => {
    const result = DealSchema.parse(
      transformDeal(makeRaw({ stage: 'Prospecting', pipelineId: 'pl1', pipelineStageId: 'ps1' })),
    )
    expect(result.stage_id).toBe('ps1')
    expect(result.pipeline_id).toBe('pl1')
    expect(result.stage).toBe('Prospecting')
  })

  it('leaves stage_id unset when Pipelines are not enabled (only the stage label is sent)', () => {
    const result = DealSchema.parse(transformDeal(makeRaw({ stage: 'Prospecting' })))
    expect(result.stage_id).toBeUndefined()
    expect(result.pipeline_id).toBeUndefined()
  })

  it('throws rather than inventing an id or a title', () => {
    expect(() => transformDeal(makeRaw({ id: undefined }))).toThrow(/Opportunity\.id/)
    expect(() => transformDeal(makeRaw({ name: undefined }))).toThrow(/name/)
  })

  it('maps company_id from accountId', () => {
    const result = transformDeal(makeRaw({ accountId: 'acc1' }))
    expect(result.company_id).toBe('acc1')
  })

  it('maps owner_id from assignedUserId', () => {
    const result = transformDeal(makeRaw({ assignedUserId: 'u1' }))
    expect(result.owner_id).toBe('u1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransforms back to platform shape', () => {
    const result = untransformDeal({ title: 'Deal A', status: 'Prospecting' })
    expect(result).toBeDefined()
    expect(result.name).toBe('Deal A')
    expect(result.stage).toBe('Prospecting')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
