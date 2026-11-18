import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawZohoPipeline,
} from '../../../../../../../src/verticals/crm/adapters/zoho-crm/transform/pipeline'

/**
 * Fixture: the first entry of the documented sample response of
 * GET /settings/pipeline?layout_id={id}, trimmed to three of its stages. Stage 4 is the one
 * the sample gives a display_value different from its actual_value.
 * https://www.zoho.com/crm/developer/docs/api/v8/get-pipelines.html
 */
function documentedPipeline(): RawZohoPipeline {
  return {
    display_value: 'Standard (Standard)',
    default: true,
    maps: [
      {
        display_value: 'Qualification',
        sequence_number: 1,
        forecast_category: { name: 'Pipeline', id: '3652397000000006787' },
        actual_value: 'Qualification',
        id: '3652397000000006801',
        forecast_type: 'Open',
      },
      {
        display_value: 'Identify Decision Makers',
        sequence_number: 4,
        forecast_category: { name: 'Pipeline', id: '3652397000000006787' },
        actual_value: 'Id. Decision Makers',
        id: '3652397000000006807',
        forecast_type: 'Open',
      },
      {
        display_value: 'Closed Won',
        sequence_number: 7,
        forecast_category: { name: 'Closed', id: '3652397000000006789' },
        actual_value: 'Closed Won',
        id: '3652397000000006815',
        forecast_type: 'Closed Won',
      },
    ],
    actual_value: 'Standard (Standard)',
    id: '3652397000003097001',
  }
}

describe('zoho-crm transformPipeline', () => {
  it('maps id and display_value to name', () => {
    const result = PipelineSchema.parse(transformPipeline(documentedPipeline()))
    expect(result.id).toBe('3652397000003097001')
    expect(result.name).toBe('Standard (Standard)')
  })

  it('reads the pipeline name from display_value, not actual_value', () => {
    const raw = documentedPipeline()
    delete raw.actual_value
    expect(PipelineSchema.parse(transformPipeline(raw)).name).toBe('Standard (Standard)')
  })

  it('maps the documented `maps` stages, named by display_value, ordered by rank of sequence_number', () => {
    const result = PipelineSchema.parse(transformPipeline(documentedPipeline()))
    expect(result.stages).toEqual([
      { id: '3652397000000006801', name: 'Qualification', order: 0 },
      { id: '3652397000000006807', name: 'Identify Decision Makers', order: 1 },
      { id: '3652397000000006815', name: 'Closed Won', order: 2 },
    ])
  })

  it('orders stages by sequence_number whatever order maps lists them in', () => {
    const raw = documentedPipeline()
    raw.maps = [...(raw.maps ?? [])].reverse()
    const result = PipelineSchema.parse(transformPipeline(raw))
    expect(result.stages?.map((st) => [st.id, st.order])).toEqual([
      ['3652397000000006801', 0],
      ['3652397000000006807', 1],
      ['3652397000000006815', 2],
    ])
  })

  it('gives no order to a stage without sequence_number', () => {
    const raw = documentedPipeline()
    delete raw.maps![1]!.sequence_number
    const result = PipelineSchema.parse(transformPipeline(raw))
    expect(result.stages).toEqual([
      { id: '3652397000000006801', name: 'Qualification', order: 0 },
      { id: '3652397000000006815', name: 'Closed Won', order: 1 },
      { id: '3652397000000006807', name: 'Identify Decision Makers' },
    ])
  })

  it('returns no stages when the pipeline has no maps', () => {
    const raw = documentedPipeline()
    delete raw.maps
    expect(PipelineSchema.parse(transformPipeline(raw)).stages).toEqual([])
  })

  it('preserves raw metadata by reference', () => {
    const raw = documentedPipeline()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    expect(() => PipelineSchema.parse(transformPipeline(documentedPipeline()))).not.toThrow()
  })
})
