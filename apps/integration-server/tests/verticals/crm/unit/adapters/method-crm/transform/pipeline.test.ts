import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawMethodPipeline,
} from '../../../../../../../src/verticals/crm/adapters/method-crm/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawMethodPipeline> = {}): RawMethodPipeline {
  return {
    RecordId: '3',
    Name: 'Sales Pipeline',
    DisplayOrder: 1,
    IsActive: true,
    ...overrides,
  }
}

describe('method-crm transformPipeline', () => {
  it('maps RecordId to string id', () => {
    expect(transformPipeline(makeRaw({ RecordId: 3 })).id).toBe('3')
  })

  it('maps Name to name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('maps IsActive to is_active', () => {
    expect(transformPipeline(makeRaw({ IsActive: true })).is_active).toBe(true)
    expect(transformPipeline(makeRaw({ IsActive: false })).is_active).toBe(false)
  })

  it('uses empty string when Name is absent', () => {
    expect(transformPipeline(makeRaw({ Name: undefined })).name).toBe('')
  })

  it('omits is_active when IsActive is not a boolean', () => {
    const raw = { RecordId: '1', IsActive: undefined } as RawMethodPipeline
    expect(transformPipeline(raw).is_active).toBeUndefined()
  })

  it('passes PipelineSchema validation', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
