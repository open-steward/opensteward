import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/dynamics365-crm/transform/pipeline'

describe('dynamics365-crm transformPipeline', () => {
  it('returns synthesised default id', () => {
    expect(transformPipeline().id).toBe('default')
  })

  it('has 4 default stages', () => {
    expect(transformPipeline().stages).toHaveLength(4)
  })

  it('stage names match D365 out-of-box stages', () => {
    const names = transformPipeline().stages?.map((s) => s.name)
    expect(names).toContain('Qualify')
    expect(names).toContain('Close')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline()
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
