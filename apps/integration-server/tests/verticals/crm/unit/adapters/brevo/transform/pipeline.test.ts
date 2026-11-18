import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawBrevoPipeline } from '../../../../../../../src/verticals/crm/adapters/brevo/transform/pipeline'

// Fixture shaped from the vendor spec's Pipeline schema — id and label live
// on `pipeline` / `pipeline_name`, not `id` / `name` (those belong to each
// stage instead).
function makeRaw(overrides: Partial<RawBrevoPipeline> = {}): RawBrevoPipeline {
  return {
    pipeline: 'PIPELINE1',
    pipeline_name: 'Sales Pipeline',
    stages: [
      { id: 'stage1', name: 'New' },
      { id: 'stage2', name: 'Won' },
    ],
    ...overrides,
  }
}

describe('brevo transformPipeline', () => {
  it('maps id from `pipeline`', () => {
    const result = transformPipeline(makeRaw())
    expect(result.id).toBe('PIPELINE1')
  })

  it('maps name from `pipeline_name`', () => {
    const result = transformPipeline(makeRaw())
    expect(result.name).toBe('Sales Pipeline')
  })

  it('does not read a top-level `id` or `name` — the spec has neither', () => {
    // Regression guard: a pipeline object carrying the OLD (wrong) fields
    // must not accidentally satisfy the new mapping.
    const result = transformPipeline({ id: 'wrong', name: 'wrong' } as unknown as RawBrevoPipeline)
    expect(result.id).toBe('')
    expect(result.name).toBe('')
  })

  it('maps stages', () => {
    const result = transformPipeline(makeRaw())
    expect(result.stages).toHaveLength(2)
    expect(result.stages?.[0]).toEqual({ id: 'stage1', name: 'New' })
    expect(result.stages?.[1]).toEqual({ id: 'stage2', name: 'Won' })
  })

  it('leaves stages undefined (not []) when the spec omits it', () => {
    const result = transformPipeline(makeRaw({ stages: undefined }))
    expect(result.stages).toBeUndefined()
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipeline({})).not.toThrow()
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
