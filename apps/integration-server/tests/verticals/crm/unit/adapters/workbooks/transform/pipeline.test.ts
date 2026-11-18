import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawWorkbooksPipeline,
} from '../../../../../../../src/verticals/crm/adapters/workbooks/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawWorkbooksPipeline> = {}): RawWorkbooksPipeline {
  return { id: 'pipe-1', ...overrides }
}

describe('workbooks transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline(makeRaw({ id: 42 })).id).toBe('42')
    expect(transformPipeline(makeRaw({ id: 'pipe-99' })).id).toBe('pipe-99')
  })

  it('maps name field', () => {
    expect(transformPipeline(makeRaw({ name: 'Sales' })).name).toBe('Sales')
  })

  it('defaults name to empty string when absent', () => {
    expect(transformPipeline(makeRaw()).name).toBe('')
  })

  it('maps created_at', () => {
    const result = transformPipeline(makeRaw({ created_at: '2026-01-15T09:30:00.000Z' }))
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps updated_at', () => {
    const result = transformPipeline(makeRaw({ updated_at: '2026-02-01T14:20:00.000Z' }))
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('sets created_at and updated_at to undefined when absent', () => {
    const result = transformPipeline(makeRaw())
    expect(result.created_at).toBeUndefined()
    expect(result.updated_at).toBeUndefined()
  })

  it('includes raw object in metadata', () => {
    const raw = makeRaw({ name: 'Sales' })
    const result = transformPipeline(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes PipelineSchema.parse without throwing', () => {
    const raw = makeRaw({
      name: 'Sales',
      created_at: '2026-01-15T09:30:00.000Z',
      updated_at: '2026-02-01T14:20:00.000Z',
    })
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
