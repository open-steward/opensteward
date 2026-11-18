import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawAttioPipeline } from '../../../../../../../src/verticals/crm/adapters/attio/transform/pipeline'

function makeRaw(overrides: Partial<RawAttioPipeline> = {}): RawAttioPipeline {
  return {
    id: { attribute_id: 'attr1' },
    title: 'Sales Pipeline',
    ...overrides,
  }
}

describe('attio transformPipeline', () => {
  it('synthesises default id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('default')
  })

  it('maps name from title', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('maps stages from select_options', () => {
    const raw = makeRaw({
      config: { select_options: [{ id: 'opt1', title: 'Qualified' }] },
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].name).toBe('Qualified')
  })

  it('defaults to empty stages', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
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
