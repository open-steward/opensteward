import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawMegaplanPipeline,
} from '../../../../../../../src/verticals/crm/adapters/megaplan/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawMegaplanPipeline> = {}): RawMegaplanPipeline {
  return { id: '1', ...overrides }
}

describe('megaplan transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 3 })).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw({ name: 'Enterprise Sales' })).name).toBe('Enterprise Sales')
  })

  it('maps schemeStages to stages with id, name, order, win_probability', () => {
    const raw = makeRaw({
      schemeStages: [
        { id: '10', name: 'Qualification', order: 0, probability: 10 },
        { id: '11', name: 'Proposal', order: 1, probability: 50 },
      ],
    })
    const result = transformPipeline(raw)
    expect(result.stages).toHaveLength(2)
    expect(result.stages![0].id).toBe('10')
    expect(result.stages![0].name).toBe('Qualification')
    expect(result.stages![0].order).toBe(0)
    expect(result.stages![0].win_probability).toBe(10)
    expect(result.stages![1].name).toBe('Proposal')
  })

  it('uses array index as order fallback when stage order is absent', () => {
    const raw = makeRaw({
      schemeStages: [
        { id: '10', name: 'Stage A' },
        { id: '11', name: 'Stage B' },
      ],
    })
    const result = transformPipeline(raw)
    expect(result.stages![0].order).toBe(0)
    expect(result.stages![1].order).toBe(1)
  })

  it('maps isActive to is_active', () => {
    expect(transformPipeline(makeRaw({ isActive: true })).is_active).toBe(true)
    expect(transformPipeline(makeRaw({ isActive: false })).is_active).toBe(false)
  })

  it('returns undefined stages when schemeStages is absent', () => {
    // The source returns undefined when schemeStages is absent
    expect(transformPipeline(makeRaw()).stages).toBeUndefined()
  })

  it('maps timeCreated to created_at', () => {
    const result = transformPipeline(makeRaw({ timeCreated: '2024-01-01T00:00:00.000Z' }))
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
    const raw: RawMegaplanPipeline = {
      id: '1',
      name: 'Sales Funnel',
      isActive: true,
      schemeStages: [
        { id: '10', name: 'Qualification', order: 0, probability: 10 },
        { id: '11', name: 'Closed Won', order: 1, probability: 100 },
      ],
      timeCreated: '2024-01-01T00:00:00.000Z',
      timeUpdated: '2024-06-01T00:00:00.000Z',
    }
    const result = transformPipeline(raw)
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
