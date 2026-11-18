import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, transformStage, type RawApolloStage } from '../../../../../../../src/verticals/crm/adapters/apollo/transform/pipeline'

function makeStage(overrides: Partial<RawApolloStage> = {}): RawApolloStage {
  return { id: 's1', name: 'Qualified', ...overrides }
}

describe('apollo transformPipeline', () => {
  it('synthesises a default pipeline id', () => {
    expect(transformPipeline([]).id).toBe('default')
  })

  it('maps stages array', () => {
    const result = transformPipeline([makeStage()])
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('s1')
  })

  it('has no raw metadata reference (synthesised)', () => {
    const result = transformPipeline([])
    expect(result.metadata).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})

describe('apollo transformStage', () => {
  it('maps id and name', () => {
    const stage = transformStage(makeStage({ id: 'x', name: 'Demo', position: 2 }))
    expect(stage.id).toBe('x')
    expect(stage.name).toBe('Demo')
    expect(stage.order).toBe(2)
  })
})
