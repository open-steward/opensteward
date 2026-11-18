import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawMazricaDealType,
} from '../../../../../../../src/verticals/crm/adapters/mazrica/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawMazricaDealType> = {}): RawMazricaDealType {
  return { id: 1, ...overrides }
}

describe('mazrica transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Standard Sales' })).name).toBe('Standard Sales')
  })

  it('maps phases to stages with id, name, order, win_probability', () => {
    const raw = makeRaw({
      phases: [
        { id: 10, name: 'Approach', order: 0, winProbability: 10 },
        { id: 11, name: 'Proposal', order: 1, winProbability: 50 },
      ],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(2)
    expect(result.stages![0].id).toBe('10')
    expect(result.stages![0].name).toBe('Approach')
    expect(result.stages![0].order).toBe(0)
    expect(result.stages![0].win_probability).toBe(10)
    expect(result.stages![1].name).toBe('Proposal')
  })

  it('maps isActive to is_active', () => {
    expect(transformPipeline(makeRaw({ isActive: true })).is_active).toBe(true)
    expect(transformPipeline(makeRaw({ isActive: false })).is_active).toBe(false)
  })

  it('defaults stages to empty array when phases is absent', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([])
  })

  it('maps createdAt to IsoDatetime', () => {
    const result = transformPipeline(makeRaw({ createdAt: '2024-01-01T00:00:00.000Z' }))
    expect(result.created_at).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('passes PipelineSchema validation', () => {
    const raw: RawMazricaDealType = {
      id: 1,
      name: 'Enterprise Sales',
      isActive: true,
      phases: [
        { id: 10, name: 'Approach', order: 0, winProbability: 10 },
        { id: 11, name: 'Closed Won', order: 1, winProbability: 100 },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
