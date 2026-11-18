import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawTeamgatePipeline,
  type RawTeamgatePipelineStage,
} from '../../../../../../../src/verticals/crm/adapters/teamgate/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeStage(overrides: Partial<RawTeamgatePipelineStage> = {}): RawTeamgatePipelineStage {
  return { id: 1, name: 'Prospect', ...overrides }
}

function makeRaw(overrides: Partial<RawTeamgatePipeline> = {}): RawTeamgatePipeline {
  return { id: 1, name: 'Sales Pipeline', ...overrides }
}

describe('teamgate transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 5 })).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales' })).name).toBe('Sales')
  })

  it('falls back to id string when name absent', () => {
    const result = transformPipeline(makeRaw({ id: 5, name: undefined }))
    expect(result.name).toBe('5')
  })

  it('maps stages array with order as index', () => {
    const result = transformPipeline(
      makeRaw({
        stages: [makeStage({ id: 10, name: 'Prospect' }), makeStage({ id: 11, name: 'Proposal' })],
      }),
    )
    expect(result.stages).toHaveLength(2)
    expect(result.stages![0].order).toBe(0)
    expect(result.stages![1].order).toBe(1)
  })

  it('maps stage id to string', () => {
    const result = transformPipeline(makeRaw({ stages: [makeStage({ id: 20 })] }))
    expect(result.stages![0].id).toBe('20')
  })

  it('maps stage name', () => {
    const result = transformPipeline(makeRaw({ stages: [makeStage({ name: 'Negotiation' })] }))
    expect(result.stages![0].name).toBe('Negotiation')
  })

  it('maps stage probability to win_probability', () => {
    const result = transformPipeline(makeRaw({ stages: [makeStage({ probability: 75 })] }))
    expect(result.stages![0].win_probability).toBe(75)
  })

  it('returns no stages when array is empty', () => {
    const result = transformPipeline(makeRaw({ stages: [] }))
    expect(result.stages).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation', () => {
    const raw = makeRaw({
      id: 5,
      name: 'Sales',
      stages: [
        makeStage({ id: 10, name: 'Prospect', probability: 20 }),
        makeStage({ id: 11, name: 'Proposal', probability: 60 }),
      ],
    })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
