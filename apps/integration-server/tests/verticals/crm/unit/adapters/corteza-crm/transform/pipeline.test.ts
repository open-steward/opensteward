import { describe, it, expect } from 'vitest'
import {
  getCortezaPipeline,
  CORTEZA_CRM_PIPELINE_ID,
  CORTEZA_CRM_PIPELINE_NAME,
  CORTEZA_OPPORTUNITY_STAGES,
} from '../../../../../../../src/verticals/crm/adapters/corteza-crm/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('corteza-crm getCortezaPipeline', () => {
  it('returns pipeline with constant id', () => {
    expect(getCortezaPipeline().id).toBe(CORTEZA_CRM_PIPELINE_ID)
  })

  it('returns pipeline with constant name', () => {
    expect(getCortezaPipeline().name).toBe(CORTEZA_CRM_PIPELINE_NAME)
  })

  it('returns is_active=true', () => {
    expect(getCortezaPipeline().is_active).toBe(true)
  })

  it('stages count matches CORTEZA_OPPORTUNITY_STAGES', () => {
    const pipeline = getCortezaPipeline()
    expect(pipeline.stages).toHaveLength(CORTEZA_OPPORTUNITY_STAGES.length)
  })

  it('stage order is 0-indexed', () => {
    const stages = getCortezaPipeline().stages!
    expect(stages[0]!.order).toBe(0)
    expect(stages[1]!.order).toBe(1)
    expect(stages[stages.length - 1]!.order).toBe(CORTEZA_OPPORTUNITY_STAGES.length - 1)
  })

  it('first stage has id derived from name', () => {
    // 'Prospecting' → 'prospecting'
    expect(getCortezaPipeline().stages![0]!.id).toBe('prospecting')
  })

  it('stage names match CORTEZA_OPPORTUNITY_STAGES', () => {
    const stages = getCortezaPipeline().stages!
    CORTEZA_OPPORTUNITY_STAGES.forEach((name, i) => {
      expect(stages[i]!.name).toBe(name)
    })
  })

  it('produces a PipelineSchema-valid result', () => {
    expect(() => PipelineSchema.parse(getCortezaPipeline())).not.toThrow()
  })
})
