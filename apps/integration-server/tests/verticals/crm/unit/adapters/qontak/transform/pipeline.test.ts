import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/qontak/transform/pipeline'
import { pipelinesList } from '../fixtures'

const doc = pipelinesList.response[0]

describe('qontak transformPipeline (documented GET /qontak/crm/pipelines example)', () => {
  it('reads only id, name and timestamps, and satisfies PipelineSchema', () => {
    const p = PipelineSchema.parse(transformPipeline(doc))
    expect(p.id).toBe('3')
    expect(p.name).toBe('Task name')
    expect(p.created_at).toBe('2024-10-28T15:18:20.790Z')
    expect(p.updated_at).toBe('2024-10-28T15:57:34.148Z')
    expect(p.stages).toBeUndefined()
    expect(p.metadata).toEqual(doc)
  })

  it('throws on a record with no name — never an empty label', () => {
    expect(() => transformPipeline({ id: 4 })).toThrow(/name/)
  })

  it('throws on a record with no id', () => {
    expect(() => transformPipeline({ id: '', name: 'Sales' })).toThrow(/no id/)
  })
})
