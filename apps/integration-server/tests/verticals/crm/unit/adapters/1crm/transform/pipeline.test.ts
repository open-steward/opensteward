import { describe, it, expect } from 'vitest'
import {
  buildDefaultPipeline,
  getPipelineById,
  ONECRM_SALES_STAGES,
} from '../../../../../../../src/verticals/crm/adapters/1crm/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('1crm buildDefaultPipeline', () => {
  it('returns a pipeline with id "1crm-default"', () => {
    expect(buildDefaultPipeline().id).toBe('1crm-default')
  })

  it('returns a named pipeline', () => {
    expect(buildDefaultPipeline().name).toBe('1CRM Default Sales Pipeline')
  })

  it('is_active is true', () => {
    expect(buildDefaultPipeline().is_active).toBe(true)
  })

  it('has the expected number of stages matching ONECRM_SALES_STAGES', () => {
    const pipeline = buildDefaultPipeline()
    expect(pipeline.stages?.length).toBe(ONECRM_SALES_STAGES.length)
  })

  it('stages are ordered by index (order field)', () => {
    const stages = buildDefaultPipeline().stages ?? []
    stages.forEach((s, idx) => {
      expect(s.order).toBe(idx)
    })
  })

  it('Closed Won stage has win_probability=100', () => {
    const stages = buildDefaultPipeline().stages ?? []
    const won = stages.find((s) => s.id === 'Closed Won')
    expect(won?.win_probability).toBe(100)
  })

  it('Closed Lost stage has win_probability=0', () => {
    const stages = buildDefaultPipeline().stages ?? []
    const lost = stages.find((s) => s.id === 'Closed Lost')
    expect(lost?.win_probability).toBe(0)
  })

  it('passes PipelineSchema.parse without throwing', () => {
    expect(() => PipelineSchema.parse(buildDefaultPipeline())).not.toThrow()
  })
})

describe('1crm getPipelineById', () => {
  it('returns the default pipeline for "1crm-default"', () => {
    const p = getPipelineById('1crm-default')
    expect(p).toBeDefined()
    expect(p?.id).toBe('1crm-default')
  })

  it('returns undefined for any other id', () => {
    expect(getPipelineById('other-id')).toBeUndefined()
    expect(getPipelineById('')).toBeUndefined()
  })
})
