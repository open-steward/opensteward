/**
 * Fixtures are built from the documented examples in the Keap REST v2 OpenAPI
 * spec (https://crm.infusionsoft.com/app/v3/api-docs/V2). The spec types ids
 * and timestamps as strings, so the fixture values are strings.
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  transformStage,
  type RawKeapOpportunityStage,
} from '../../../../../../../src/verticals/crm/adapters/keap/transform/pipeline'

/** Documented `RestOpportunityStage` example values. */
const DOC: RawKeapOpportunityStage = {
  id: '1',
  name: 'Qualified',
  order: 2,
  target_number_days: 14,
  probability: 50,
  created_time: '2024-01-10T08:00:00Z',
  updated_time: '2024-03-15T10:30:00Z',
}

describe('keap transformPipeline', () => {
  it('maps the documented example and satisfies the schema', () => {
    const result = PipelineSchema.parse(transformPipeline([DOC]))
    expect(result.id).toBe('default')
    expect(result.stages).toEqual([{ id: '1', name: 'Qualified', order: 0, win_probability: 50 }])
  })

  it('orders stages by the documented order field', () => {
    const result = transformPipeline([
      { id: '30', name: 'Won', order: 3 },
      { id: '10', name: 'Lead', order: 1 },
      { id: '20', name: 'Qualified', order: 2 },
    ])
    expect(result.stages?.map((s) => [s.id, s.order])).toEqual([
      ['10', 0],
      ['20', 1],
      ['30', 2],
    ])
  })

  it('handles an empty stage list', () => {
    expect(() => PipelineSchema.parse(transformPipeline([]))).not.toThrow()
  })

  it('keeps the raw stages in metadata', () => {
    expect(transformPipeline([DOC]).metadata).toEqual({ stages: [DOC] })
  })
})

describe('keap transformStage', () => {
  it('maps id, name, probability and position', () => {
    expect(transformStage(DOC, 2)).toEqual({
      id: '1',
      name: 'Qualified',
      order: 2,
      win_probability: 50,
    })
  })

  it('leaves win_probability unset when probability is absent', () => {
    expect(transformStage({ id: '5', name: 'Close' }, 0).win_probability).toBeUndefined()
  })
})
