import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawFolkDeal } from '../../../../../../../src/verticals/crm/adapters/folk/transform/deal'

function makeRaw(overrides: Partial<RawFolkDeal> = {}): RawFolkDeal {
  return { id: 'd1', name: 'Big Deal', ...overrides }
}

describe('folk transformDeal', () => {
  it('maps id', () => {
    expect(transformDeal(makeRaw()).id).toBe('d1')
  })

  it('maps title from name', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps value from value field', () => {
    const result = transformDeal(makeRaw({ value: 1000, currency: 'EUR' }))
    expect(result.value?.amount).toBe(1000)
    expect(result.value?.currency).toBe('EUR')
  })

  it('maps stage_id and pipeline_id', () => {
    const result = transformDeal(makeRaw({ stageId: 's1', pipelineId: 'p1' }))
    expect(result.stage_id).toBe('s1')
    expect(result.pipeline_id).toBe('p1')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('untransformDeal maps name', () => {
    expect(untransformDeal({ title: 'Test' }).name).toBe('Test')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})
