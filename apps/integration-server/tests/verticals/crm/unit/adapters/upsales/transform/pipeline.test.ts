import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipelineFromStages } from '../../../../../../../src/verticals/crm/adapters/upsales/transform/pipeline'
import { STAGE_LIST } from '../fixtures'

describe('upsales transformPipelineFromStages (documented "Get stage list" sample)', () => {
  it('folds every stage into one pipeline, keeping the order it was given', () => {
    const p = PipelineSchema.parse(transformPipelineFromStages(STAGE_LIST.data))
    expect(p.id).toBe('default')
    expect(p.stages?.map((s) => s.id)).toEqual(['9', '11', '12', '7', '8', '10'])
    expect(p.stages?.[0]).toEqual({ id: '9', name: 'Prospect 1', win_probability: 25 })
    expect(p.stages?.[3]?.win_probability).toBe(0)
    expect((p.metadata as Record<string, unknown>).stages).toBe(STAGE_LIST.data)
  })

  it('sets no stage order: the documented stage has no position field', () => {
    const p = PipelineSchema.parse(transformPipelineFromStages(STAGE_LIST.data))
    expect(p.stages?.every((s) => s.order === undefined)).toBe(true)
  })

  it('throws on a stage without its mandatory name rather than inventing one', () => {
    const { name: _name, ...nameless } = STAGE_LIST.data[0]!
    expect(() => transformPipelineFromStages([nameless])).toThrow(/mandatory/)
  })

  it('parses with no stages', () => {
    expect(() => PipelineSchema.parse(transformPipelineFromStages([]))).not.toThrow()
  })
})
