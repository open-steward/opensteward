import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawZendeskSellPipeline, type RawZendeskSellStage } from '../../../../../../../src/verticals/crm/adapters/zendesk-sell/transform/pipeline'

function makePipeline(overrides: Partial<RawZendeskSellPipeline> = {}): RawZendeskSellPipeline {
  return { id: 1, name: 'Main Pipeline', ...overrides }
}

function makeStage(overrides: Partial<RawZendeskSellStage> = {}): RawZendeskSellStage {
  return { id: 10, name: 'Lead', position: 1, ...overrides }
}

describe('zendesk-sell transformPipeline', () => {
  it('maps id and name', () => {
    const result = transformPipeline(makePipeline())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Main Pipeline')
  })

  it('maps stages with position as order', () => {
    const pipeline = transformPipeline(makePipeline(), [makeStage({ id: 10, name: 'Qualify', position: 2 })])
    expect(pipeline.stages?.[0]?.id).toBe('10')
    expect(pipeline.stages?.[0]?.order).toBe(2)
  })

  it('handles missing stages gracefully', () => {
    expect(transformPipeline(makePipeline()).stages).toHaveLength(0)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makePipeline()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makePipeline())
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
