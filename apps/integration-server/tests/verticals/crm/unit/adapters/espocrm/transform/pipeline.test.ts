/**
 * EspoCRM Pipeline (v10.0+) + PipelineStage → canonical Pipeline.
 *
 * Fixture fields come from the vendor's entity definitions
 * (github.com/espocrm/espocrm, application/Espo/Resources/metadata/entityDefs/
 * Pipeline.json and PipelineStage.json), and datetimes use the documented
 * format (docs.espocrm.com/development/api/: "Datetime format: YYYY-MM-DD
 * HH:mm:ss. All datetime values are represented in UTC timezone").
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawEspoCrmPipeline,
  type RawEspoCrmPipelineStage,
} from '../../../../../../../src/verticals/crm/adapters/espocrm/transform/pipeline'

const PIPELINE: RawEspoCrmPipeline = {
  id: '6650a1b2c3d4e5f60',
  name: 'Enterprise sales',
  order: 2,
  status: 'Active',
  entityType: 'Opportunity',
  field: 'stage',
  color: 3,
  isAvailableForAll: true,
  description: null,
  createdAt: '2025-11-03 09:15:42',
  modifiedAt: '2026-01-20 17:05:00',
}

const STAGES: RawEspoCrmPipelineStage[] = [
  { id: 'st1', name: 'Discovery', order: 1, mappedStatus: 'Prospecting', pipelineId: PIPELINE.id },
  { id: 'st2', name: 'Pricing', order: 2, mappedStatus: 'Proposal', pipelineId: PIPELINE.id },
  { id: 'st3', name: 'Signed', order: 3, mappedStatus: 'Closed Won', pipelineId: PIPELINE.id },
]

describe('espocrm transformPipeline', () => {
  it('produces canonical output that satisfies the schema', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(result).toMatchObject({
      id: '6650a1b2c3d4e5f60',
      name: 'Enterprise sales',
      is_active: true,
      created_at: '2025-11-03T09:15:42Z',
      updated_at: '2026-01-20T17:05:00Z',
    })
  })

  it('maps stages in the order returned, 0-indexed', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(result.stages).toEqual([
      { id: 'st1', name: 'Discovery', order: 0 },
      { id: 'st2', name: 'Pricing', order: 1 },
      { id: 'st3', name: 'Signed', order: 2 },
    ])
  })

  it('maps status Inactive to is_active false', () => {
    const result = PipelineSchema.parse(transformPipeline({ ...PIPELINE, status: 'Inactive' }, []))
    expect(result.is_active).toBe(false)
    expect(result.stages).toEqual([])
  })

  it('omits is_active and timestamps when EspoCRM sends none', () => {
    const result = PipelineSchema.parse(
      transformPipeline(
        { id: 'p', name: 'n', status: null, createdAt: null, modifiedAt: null },
        [],
      ),
    )
    expect(result).not.toHaveProperty('is_active')
    expect(result).not.toHaveProperty('created_at')
    expect(result).not.toHaveProperty('updated_at')
  })

  it('keeps the raw pipeline and stages in metadata', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(result.metadata).toEqual({ ...PIPELINE, stages: STAGES })
  })

  it('throws on a pipeline with no id or name rather than inventing one', () => {
    expect(() => transformPipeline({ ...PIPELINE, id: '' }, [])).toThrow(/Pipeline.id/)
    expect(() => transformPipeline({ ...PIPELINE, name: '' }, [])).toThrow(/name/)
    expect(() => transformPipeline(PIPELINE, [{ id: 'x', name: '' }])).toThrow(/name/)
  })
})
