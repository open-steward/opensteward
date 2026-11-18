import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawGoldVisionPipeline,
  type RawGoldVisionPipelineStage,
} from '../../../../../../../src/verticals/crm/adapters/gold-vision/transform/pipeline'

function makeRawStage(
  overrides: Partial<RawGoldVisionPipelineStage> = {},
): RawGoldVisionPipelineStage {
  return { id: 10, summary: 'Stage One', ...overrides }
}

function makeRaw(overrides: Partial<RawGoldVisionPipeline> = {}): RawGoldVisionPipeline {
  return { id: 1, ...overrides }
}

describe('gold-vision transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 42 })).id).toBe('42')
  })

  it('returns empty string id when absent', () => {
    expect(transformPipeline(makeRaw({ id: undefined })).id).toBe('')
  })

  it('maps summary to name', () => {
    expect(transformPipeline(makeRaw({ summary: 'Sales Pipeline' })).name).toBe('Sales Pipeline')
  })

  it('returns empty string name when summary absent', () => {
    expect(transformPipeline(makeRaw({ summary: undefined })).name).toBe('')
  })

  it('maps isActive to is_active', () => {
    expect(transformPipeline(makeRaw({ isActive: true })).is_active).toBe(true)
  })

  it('maps isActive false through', () => {
    expect(transformPipeline(makeRaw({ isActive: false })).is_active).toBe(false)
  })

  it('returns undefined is_active when absent', () => {
    expect(transformPipeline(makeRaw({ isActive: undefined })).is_active).toBeUndefined()
  })

  it('returns empty stages array when stages absent', () => {
    expect(transformPipeline(makeRaw({ stages: undefined })).stages).toEqual([])
  })

  it('maps stages array', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage()] }))
    expect(result.stages).toHaveLength(1)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields without throwing', () => {
    expect(() => transformPipeline(makeRaw())).not.toThrow()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline(makeRaw({ id: 42 }))
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})

describe('gold-vision transformPipeline stage mapping', () => {
  it('maps stage id to string', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ id: 10 })] }))
    expect(result.stages?.[0].id).toBe('10')
  })

  it('returns empty string stage id when absent', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ id: undefined })] }))
    expect(result.stages?.[0].id).toBe('')
  })

  it('maps stage summary to name', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ summary: 'Qualified' })] }))
    expect(result.stages?.[0].name).toBe('Qualified')
  })

  it('returns empty string stage name when summary absent', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ summary: undefined })] }))
    expect(result.stages?.[0].name).toBe('')
  })

  it('maps numeric sortOrder to order', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ sortOrder: 2 })] }))
    expect(result.stages?.[0].order).toBe(2)
  })

  it('parses string sortOrder to integer', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ sortOrder: '2' })] }))
    expect(result.stages?.[0].order).toBe(2)
  })

  it('returns undefined order when sortOrder is NaN string', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ sortOrder: 'bad' })] }))
    if (result.stages === undefined) throw new Error('expected stages to be defined')
    expect(result.stages[0].order).toBeUndefined()
  })

  it('returns undefined order when sortOrder absent', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ sortOrder: undefined })] }))
    if (result.stages === undefined) throw new Error('expected stages to be defined')
    expect(result.stages[0].order).toBeUndefined()
  })

  it('maps numeric stage probability to win_probability', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ probability: 80 })] }))
    expect(result.stages?.[0].win_probability).toBe(80)
  })

  it('parses string stage probability to number', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ probability: '80' })] }))
    expect(result.stages?.[0].win_probability).toBe(80)
  })

  it('returns undefined win_probability when NaN string', () => {
    const result = transformPipeline(makeRaw({ stages: [makeRawStage({ probability: 'bad' })] }))
    if (result.stages === undefined) throw new Error('expected stages to be defined')
    expect(result.stages[0].win_probability).toBeUndefined()
  })

  it('returns undefined win_probability when absent', () => {
    const result = transformPipeline(
      makeRaw({ stages: [makeRawStage({ probability: undefined })] }),
    )
    if (result.stages === undefined) throw new Error('expected stages to be defined')
    expect(result.stages[0].win_probability).toBeUndefined()
  })
})
