import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipelineFromMilestones,
  type RawNutshellMilestone,
} from '../../../../../../../src/verticals/crm/adapters/nutshell/transform/pipeline'

function makeMilestone(overrides: Partial<RawNutshellMilestone> = {}): RawNutshellMilestone {
  return { id: 1, name: 'Prospecting', ...overrides }
}

describe('nutshell transformPipelineFromMilestones', () => {
  it('returns a pipeline with id "default"', () => {
    expect(transformPipelineFromMilestones([]).id).toBe('default')
  })

  it('maps milestones to stages', () => {
    const pipeline = transformPipelineFromMilestones([
      makeMilestone({ id: 1, name: 'Prospecting' }),
      makeMilestone({ id: 2, name: 'Closing' }),
    ])
    expect(pipeline.stages).toHaveLength(2)
    expect(pipeline.stages?.[0]?.id).toBe('1')
    expect(pipeline.stages?.[1]?.name).toBe('Closing')
  })

  it('uses orderBy if present', () => {
    const pipeline = transformPipelineFromMilestones([
      makeMilestone({ id: 1, name: 'A', orderBy: 10 }),
    ])
    expect(pipeline.stages?.[0]?.order).toBe(10)
  })

  it('falls back to index when orderBy absent', () => {
    const pipeline = transformPipelineFromMilestones([makeMilestone()])
    expect(pipeline.stages?.[0]?.order).toBe(0)
  })

  it('embeds raw milestones in metadata', () => {
    const milestones = [makeMilestone()]
    const pipeline = transformPipelineFromMilestones(milestones)
    expect((pipeline.metadata as Record<string, unknown>)['milestones']).toBe(milestones)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipelineFromMilestones([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
