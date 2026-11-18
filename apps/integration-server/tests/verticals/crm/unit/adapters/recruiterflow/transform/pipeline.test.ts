import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawRecruiterflowPipeline,
} from '../../../../../../../src/verticals/crm/adapters/recruiterflow/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawRecruiterflowPipeline> = {}): RawRecruiterflowPipeline {
  return {
    id: 'pipe-1',
    name: 'Engineering Recruits',
    ...overrides,
  }
}

describe('recruiterflow transformPipeline', () => {
  it('maps id', () => {
    expect(transformPipeline(makeRaw()).id).toBe('pipe-1')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Engineering Recruits')
  })

  it('uses empty string for name when absent', () => {
    expect(transformPipeline(makeRaw({ name: undefined })).name).toBe('')
  })

  it('passes PipelineSchema validation', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
