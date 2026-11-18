import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawLoxoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/loxo/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawLoxoPipeline> = {}): RawLoxoPipeline {
  return { id: 1, ...overrides }
}

describe('loxo transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('maps stages with id, name, order, and win_probability', () => {
    const raw = makeRaw({
      stages: [
        { id: 10, name: 'Prospecting', position: 0, win_probability: 10 },
        { id: 11, name: 'Proposal', position: 1, win_probability: 50 },
      ],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(2)
    expect(result.stages![0].id).toBe('10')
    expect(result.stages![0].name).toBe('Prospecting')
    expect(result.stages![0].order).toBe(0)
    expect(result.stages![0].win_probability).toBe(10)
    expect(result.stages![1].name).toBe('Proposal')
  })

  it('maps created_at to IsoDatetime', () => {
    const result = transformPipeline(makeRaw({ created_at: '2024-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('defaults stages to empty array when not provided', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation', () => {
    const raw: RawLoxoPipeline = {
      id: 1,
      name: 'Main Sales',
      stages: [
        { id: 10, name: 'Prospecting', position: 0, win_probability: 10 },
        { id: 11, name: 'Closed Won', position: 1, win_probability: 100 },
      ],
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-06-01T00:00:00.000Z',
    }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
