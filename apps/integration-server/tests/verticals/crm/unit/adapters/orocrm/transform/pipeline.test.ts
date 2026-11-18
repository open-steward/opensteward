import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawOrocrmWorkflowStep,
} from '../../../../../../../src/verticals/crm/adapters/orocrm/transform/pipeline'
import type { JsonApiRecord } from '../../../../../../../src/verticals/crm/adapters/orocrm/client'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRecord(attrs: Record<string, unknown> = {}): JsonApiRecord {
  return {
    type: 'workflowdefinitions',
    id: 'wf_1',
    attributes: {
      label: 'Sales Opportunity Flow',
      active: true,
      createdAt: '2026-01-15T09:30:00.000Z',
      updatedAt: '2026-02-01T14:20:00.000Z',
      ...attrs,
    },
  }
}

const sampleSteps: RawOrocrmWorkflowStep[] = [
  { id: 'step_won', label: 'Won', stepOrder: 3, isFinal: true },
  { id: 'step_qualify', label: 'Qualify', stepOrder: 1, isFinal: false },
  { id: 'step_negotiate', label: 'Negotiate', stepOrder: 2, isFinal: false },
]

describe('orocrm transformPipeline', () => {
  it('maps record.id to string id', () => {
    expect(transformPipeline(makeRecord()).id).toBe('wf_1')
  })

  it('maps label attribute to name', () => {
    expect(transformPipeline(makeRecord()).name).toBe('Sales Opportunity Flow')
  })

  it('falls back to name attribute when label is absent', () => {
    expect(transformPipeline(makeRecord({ label: undefined, name: 'Fallback Flow' })).name).toBe(
      'Fallback Flow',
    )
  })

  it('uses record.id as name when both label and name are absent', () => {
    expect(transformPipeline(makeRecord({ label: undefined, name: undefined })).name).toBe('wf_1')
  })

  it('maps active attribute to is_active', () => {
    expect(transformPipeline(makeRecord({ active: true })).is_active).toBe(true)
    expect(transformPipeline(makeRecord({ active: false })).is_active).toBe(false)
  })

  it('filters out final steps and sorts remaining by stepOrder', () => {
    const stages = transformPipeline(makeRecord(), sampleSteps).stages
    // Won is isFinal=true so excluded; Qualify (order 1) and Negotiate (order 2) remain
    expect(stages).toHaveLength(2)
    expect(stages?.[0].id).toBe('step_qualify')
    expect(stages?.[0].name).toBe('Qualify')
    expect(stages?.[0].order).toBe(0) // re-indexed by array position
    expect(stages?.[1].id).toBe('step_negotiate')
  })

  it('returns undefined stages when no steps are provided', () => {
    expect(transformPipeline(makeRecord()).stages).toBeUndefined()
  })

  it('maps createdAt / updatedAt', () => {
    const result = transformPipeline(makeRecord())
    expect(result.created_at).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updated_at).toBe('2026-02-01T14:20:00.000Z')
  })

  it('passes PipelineSchema validation with stages', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRecord(), sampleSteps))).not.toThrow()
  })

  it('passes PipelineSchema validation without stages', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRecord()))).not.toThrow()
  })
})
