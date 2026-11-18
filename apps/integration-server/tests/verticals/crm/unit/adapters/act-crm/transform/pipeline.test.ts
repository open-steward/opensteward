import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawActPipeline } from '../../../../../../../src/verticals/crm/adapters/act-crm/transform/pipeline'

function makeRaw(overrides: Partial<RawActPipeline> = {}): RawActPipeline {
  return { id: '1', ...overrides }
}

describe('act-crm transformPipeline', () => {
  it('maps id', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('1')
  })

  it('falls back to pipelineId when id is missing', () => {
    const result = transformPipeline(makeRaw({ id: undefined, pipelineId: 'p1' }))
    expect(result.id).toBe('p1')
  })

  it('maps name from pipelineName', () => {
    const result = transformPipeline(makeRaw({ pipelineName: 'Sales Pipeline' }))
    expect(result.name).toBe('Sales Pipeline')
  })

  it('maps stages from stages array', () => {
    const result = transformPipeline(makeRaw({
      stages: [{ id: 's1', name: 'Stage 1' }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('s1')
    expect(result.stages![0].name).toBe('Stage 1')
  })

  it('maps stages from stageList when stages is missing', () => {
    const result = transformPipeline(makeRaw({
      stageList: [{ id: 's2', stageName: 'Stage 2' }],
    }))
    expect(result.stages).toHaveLength(1)
    expect(result.stages![0].id).toBe('s2')
  })

  it('produces empty stages when none provided', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw())
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
