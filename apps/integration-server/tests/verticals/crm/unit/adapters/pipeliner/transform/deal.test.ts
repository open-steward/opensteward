import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import {
  transformDeal,
  untransformDeal,
  type RawPipelinerOpportunity,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/deal'

function makeRaw(overrides: Partial<RawPipelinerOpportunity> = {}): RawPipelinerOpportunity {
  return { id: 'opp-1', name: 'Big Deal', ...overrides }
}

describe('pipeliner transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw({ id: 'opp-5' })).id).toBe('opp-5')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value', () => {
    const result = transformDeal(makeRaw({ value: 2500, currency_id: 'EUR' }))
    expect(result.value?.amount).toBe(2500)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps stage_id from sales_status_id', () => {
    expect(transformDeal(makeRaw({ sales_status_id: 'stage-1' })).stage_id).toBe('stage-1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw({ id: 'opp-5' }))
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('pipeliner untransformDeal', () => {
  it('maps stage_id to sales_status_id', () => {
    const result = untransformDeal({ stage_id: 'stage-2' })
    expect(result.sales_status_id).toBe('stage-2')
  })
})
