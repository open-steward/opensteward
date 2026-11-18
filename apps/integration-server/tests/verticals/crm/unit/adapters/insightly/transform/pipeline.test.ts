import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawInsightlyPipeline,
} from '../../../../../../../src/verticals/crm/adapters/insightly/transform/pipeline'

function makeRaw(overrides: Partial<RawInsightlyPipeline> = {}): RawInsightlyPipeline {
  return { PIPELINE_ID: 1, PIPELINE_NAME: 'Main', ...overrides }
}

describe('insightly transformPipeline', () => {
  it('maps PIPELINE_ID to string id', () => {
    expect(transformPipeline(makeRaw({ PIPELINE_ID: 3 })).id).toBe('3')
  })

  it('maps PIPELINE_NAME to name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Main')
  })

  it('maps STAGES to stages', () => {
    const result = transformPipeline(makeRaw({
      STAGES: [{ STAGE_ID: 10, STAGE_NAME: 'Qualify', STAGE_ORDER: 1, WIN_PROBABILITY: 25 }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('10')
    expect(result.stages?.[0].name).toBe('Qualify')
    expect(result.stages?.[0].win_probability).toBe(25)
  })

  it('defaults stages to empty array', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ PIPELINE_ID: 3 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
