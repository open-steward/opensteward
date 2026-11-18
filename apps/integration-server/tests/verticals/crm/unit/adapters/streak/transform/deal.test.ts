import { describe, it, expect } from 'vitest'
import { DealSchema } from '../../../../../../../src/verticals/crm/schema/deal'
import { transformDeal, untransformDeal, type RawStreakBox } from '../../../../../../../src/verticals/crm/adapters/streak/transform/deal'

function makeRaw(overrides: Partial<RawStreakBox> = {}): RawStreakBox {
  return { key: 'boxKey1', name: 'Big Deal', ...overrides }
}

describe('streak transformDeal', () => {
  it('maps key to id', () => {
    expect(transformDeal(makeRaw()).id).toBe('boxKey1')
  })

  it('maps name to title', () => {
    expect(transformDeal(makeRaw()).title).toBe('Big Deal')
  })

  it('maps pipelineKey to pipeline_id', () => {
    expect(transformDeal(makeRaw({ pipelineKey: 'pipeA' })).pipeline_id).toBe('pipeA')
  })

  it('converts createdDate timestamp to ISO string', () => {
    const ts = 1700000000000
    expect(transformDeal(makeRaw({ createdDate: ts })).created_at).toBe(new Date(ts).toISOString())
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformDeal(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformDeal(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDeal(makeRaw())
    expect(() => DealSchema.parse(result)).not.toThrow()
  })
})

describe('streak untransformDeal', () => {
  it('maps title to name', () => {
    expect(untransformDeal({ title: 'Deal X' }).name).toBe('Deal X')
  })

  it('maps stage_id to stageKey', () => {
    expect(untransformDeal({ stage_id: 's1' }).stageKey).toBe('s1')
  })
})
