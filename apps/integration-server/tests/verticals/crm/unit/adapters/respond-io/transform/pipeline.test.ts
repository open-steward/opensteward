import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawRespondIoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/respond-io/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('respond-io transformPipeline', () => {
  it('maps id to string', () => {
    expect(transformPipeline({ id: 3 }).id).toBe('3')
  })

  it('maps name, falling back to empty string', () => {
    expect(transformPipeline({ id: '1', name: 'Sales' }).name).toBe('Sales')
    expect(transformPipeline({ id: '1' }).name).toBe('')
  })

  it('preserves raw metadata', () => {
    const raw: RawRespondIoPipeline = { id: '5', name: 'Pipe' }
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const raw: RawRespondIoPipeline = { id: '1', name: 'Main Pipeline' }
    expect(() => PipelineSchema.parse(transformPipeline(raw))).not.toThrow()
  })
})
