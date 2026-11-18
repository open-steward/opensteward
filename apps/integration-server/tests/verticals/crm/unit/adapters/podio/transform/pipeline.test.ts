import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type PodioStageOption,
} from '../../../../../../../src/verticals/crm/adapters/podio/transform/pipeline'

function makeOption(overrides: Partial<PodioStageOption> = {}): PodioStageOption {
  return { id: 1, text: 'New', ...overrides }
}

describe('podio transformPipeline', () => {
  it('uses dealAppId as pipeline id', () => {
    expect(transformPipeline('app-123', [], {}).id).toBe('app-123')
  })

  it('maps options to stages', () => {
    const pipeline = transformPipeline('app-1', [
      makeOption({ id: 1, text: 'Prospecting' }),
      makeOption({ id: 2, text: 'Closing' }),
    ], {})
    expect(pipeline.stages).toHaveLength(2)
    expect(pipeline.stages?.[0]?.name).toBe('Prospecting')
  })

  it('assigns sequential order to stages', () => {
    const pipeline = transformPipeline('app-1', [
      makeOption({ id: 1 }),
      makeOption({ id: 2 }),
    ], {})
    expect(pipeline.stages?.[0]?.order).toBe(0)
    expect(pipeline.stages?.[1]?.order).toBe(1)
  })

  it('embeds raw in metadata', () => {
    const raw = { appId: 'app-1' }
    expect(transformPipeline('app-1', [], raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline('app-123', [], {})
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
