import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawSpiroPipeline,
  type RawSpiroPipelineStage,
} from '../../../../../../../src/verticals/crm/adapters/spiro/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { PIPELINES_LIST, STAGES_LIST } from '../fixtures'

const PIPELINE: RawSpiroPipeline = PIPELINES_LIST.data[0]
const STAGES: RawSpiroPipelineStage[] = STAGES_LIST.data

describe('spiro transformPipeline (documented GET /api/v1/pipelines + opportunity_stages examples)', () => {
  it('parses against PipelineSchema with every documented field in place', () => {
    const p = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(p).toMatchObject({ id: '133', name: 'Pipeline 16', is_active: true })
    expect(p.stages).toEqual([
      { id: '379', name: 'Stage 37' },
      { id: '380', name: 'Stage 38' },
      { id: '381', name: 'Stage 39' },
    ])
  })

  it('orders stages by Spiro index, whatever order they arrived in', () => {
    const p = transformPipeline(PIPELINE, [...STAGES].reverse())
    expect(p.stages?.map((s) => s.id)).toEqual(['379', '380', '381'])
  })

  it('keeps the raw pipeline and its raw stages in metadata', () => {
    const p = transformPipeline(PIPELINE, STAGES)
    expect(p.metadata).toMatchObject({ id: '133', attributes: PIPELINE.attributes })
    expect(p.metadata['opportunity_stages']).toEqual(STAGES)
  })

  it('carries an inactive pipeline through as is_active false', () => {
    const inactive = { ...PIPELINE, attributes: { ...PIPELINE.attributes, is_active: false } }
    expect(PipelineSchema.parse(transformPipeline(inactive, STAGES)).is_active).toBe(false)
  })

  it('an empty stage list is an empty array, not a fabricated stage', () => {
    expect(PipelineSchema.parse(transformPipeline(PIPELINE, [])).stages).toEqual([])
  })
})
