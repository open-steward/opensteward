import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawDaylitePipeline,
  type RawDaylitePipelineStage,
} from '../../../../../../../src/verticals/crm/adapters/daylite/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeStage(overrides: Partial<RawDaylitePipelineStage> = {}): RawDaylitePipelineStage {
  return { self: '/v1/pipeline_stages/1', name: 'Prospecting', ordering: 1, ...overrides }
}

function makeRaw(overrides: Partial<RawDaylitePipeline> = {}): RawDaylitePipeline {
  return { self: '/v1/pipelines/1', name: 'Sales Pipeline', stages: [], ...overrides }
}

describe('daylite transformPipeline', () => {
  it('extracts id from self URL', () => {
    expect(transformPipeline(makeRaw({ self: '/v1/pipelines/5' })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformPipeline(makeRaw({ name: undefined })).name).toBe('')
  })

  it('maps stages array', () => {
    const pipeline = transformPipeline(
      makeRaw({
        stages: [
          makeStage({ self: '/v1/pipeline_stages/1', name: 'Prospecting', ordering: 1 }),
          makeStage({ self: '/v1/pipeline_stages/2', name: 'Proposal', ordering: 2 }),
        ],
      }),
    )
    expect(pipeline.stages).toHaveLength(2)
    expect(pipeline.stages![0]!.id).toBe('1')
    expect(pipeline.stages![1]!.name).toBe('Proposal')
  })

  it('normalises ordering to 0-indexed order', () => {
    const pipeline = transformPipeline(
      makeRaw({
        stages: [
          makeStage({ ordering: 1 }),
          makeStage({ self: '/v1/pipeline_stages/2', ordering: 2 }),
        ],
      }),
    )
    expect(pipeline.stages![0]!.order).toBe(0)
    expect(pipeline.stages![1]!.order).toBe(1)
  })

  it('stage win_probability is always undefined', () => {
    const pipeline = transformPipeline(makeRaw({ stages: [makeStage()] }))
    expect(pipeline.stages![0]!.win_probability).toBeUndefined()
  })

  it('passes create_date as created_at', () => {
    const result = transformPipeline(makeRaw({ create_date: '2026-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces a PipelineSchema-valid result', () => {
    const raw = makeRaw({
      stages: [
        makeStage(),
        makeStage({ self: '/v1/pipeline_stages/2', name: 'Proposal', ordering: 2 }),
      ],
    })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
