import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawWatiPipeline,
} from '../../../../../../../src/verticals/crm/adapters/wati/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('wati transformPipeline (stub)', () => {
  it('maps id to string', () => {
    const raw: RawWatiPipeline = { id: 'pipe_001', name: 'My Pipeline' }
    expect(transformPipeline(raw).id).toBe('pipe_001')
  })

  it('converts numeric id to string', () => {
    const raw: RawWatiPipeline = { id: 42 }
    expect(transformPipeline(raw).id).toBe('42')
  })

  it('maps name', () => {
    const raw: RawWatiPipeline = { id: 'pipe_001', name: 'Sales' }
    expect(transformPipeline(raw).name).toBe('Sales')
  })

  it('name defaults to empty string when absent', () => {
    const raw: RawWatiPipeline = { id: 'pipe_001' }
    expect(transformPipeline(raw).name).toBe('')
  })

  it('preserves raw as metadata by reference', () => {
    const raw: RawWatiPipeline = { id: 'pipe_001', name: 'Sales' }
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawWatiPipeline = { id: 'pipe_001', name: 'Sales' }
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
