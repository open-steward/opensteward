import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline, type RawSalesforcePicklistValue } from '../../../../../../../src/verticals/crm/adapters/salesforce/transform/pipeline'

function makeStage(overrides: Partial<RawSalesforcePicklistValue> = {}): RawSalesforcePicklistValue {
  return { value: 'Prospecting', label: 'Prospecting', active: true, ...overrides }
}

describe('salesforce transformPipeline', () => {
  it('returns a pipeline with id "default"', () => {
    expect(transformPipeline([makeStage()]). id).toBe('default')
  })

  it('maps picklist values to stages', () => {
    const stages = transformPipeline([makeStage({ value: 'Closing', label: 'Closing' })]).stages
    expect(stages?.[0]?.id).toBe('Closing')
    expect(stages?.[0]?.name).toBe('Closing')
  })

  it('filters out inactive stages', () => {
    const pipeline = transformPipeline([
      makeStage({ value: 'Active', active: true }),
      makeStage({ value: 'Inactive', active: false }),
    ])
    expect(pipeline.stages).toHaveLength(1)
    expect(pipeline.stages?.[0]?.id).toBe('Active')
  })

  it('sets order based on array index', () => {
    const pipeline = transformPipeline([makeStage({ value: 'A' }), makeStage({ value: 'B' })])
    expect(pipeline.stages?.[0]?.order).toBe(0)
    expect(pipeline.stages?.[1]?.order).toBe(1)
  })

  it('handles empty list', () => {
    const pipeline = transformPipeline([])
    expect(pipeline.stages).toHaveLength(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipeline([makeStage()])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
