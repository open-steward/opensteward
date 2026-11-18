/**
 * Fixture fields from `Pipeline.DealsPipeline` / `Pipeline.DealStage` in the
 * OpenAPI spec embedded in https://www.nimble.com/developers/docs/
 * (200 of GET /api/v2/deals/pipelines, "Success executing of retrieving all
 * user pipelines"): pipeline_id, name, created, updated, archived_at
 * ("None if it's not archived"), stages[] of { stage_id, name, … }.
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawNimblePipeline,
} from '../../../../../../../src/verticals/crm/adapters/nimble/transform/pipeline'

function makeRaw(overrides: Partial<RawNimblePipeline> = {}): RawNimblePipeline {
  return {
    pipeline_id: '65958d7ef2e8748e6361dd00',
    name: 'Sales',
    description: null,
    created: '2024-01-03T16:40:30+0000',
    updated: '2024-01-04T09:00:00+0000',
    archived_at: null,
    color: '#2685c4',
    is_default: true,
    default_currency: 'USD',
    stages: [
      {
        stage_id: '65958d7ef2e8748e6361dd01',
        name: 'Qualified',
        default_probability: 10,
        expected_days: 7,
        archived_at: null,
      },
      { stage_id: '65958d7ef2e8748e6361dd02', name: 'Won', role: { name: 'won', is_final: true } },
    ],
    ...overrides,
  }
}

describe('nimble transformPipeline', () => {
  it('maps pipeline_id to id and stage_id to the stage id', () => {
    const result = PipelineSchema.parse(transformPipeline(makeRaw()))
    expect(result.id).toBe('65958d7ef2e8748e6361dd00')
    expect(result.name).toBe('Sales')
    expect(result.stages).toEqual([
      { id: '65958d7ef2e8748e6361dd01', name: 'Qualified' },
      { id: '65958d7ef2e8748e6361dd02', name: 'Won' },
    ])
  })

  it('normalises created and updated to ISO 8601', () => {
    const result = PipelineSchema.parse(transformPipeline(makeRaw()))
    expect(result.created_at).toBe('2024-01-03T16:40:30.000Z')
    expect(result.updated_at).toBe('2024-01-04T09:00:00.000Z')
  })

  it('is active while archived_at is null, inactive once it is set', () => {
    expect(PipelineSchema.parse(transformPipeline(makeRaw())).is_active).toBe(true)
    const archived = transformPipeline(makeRaw({ archived_at: '2024-02-01T00:00:00+0000' }))
    expect(PipelineSchema.parse(archived).is_active).toBe(false)
  })

  it('leaves is_active out when archived_at is absent', () => {
    const raw = makeRaw()
    delete raw.archived_at
    expect(PipelineSchema.parse(transformPipeline(raw)).is_active).toBeUndefined()
  })

  it('reads no undocumented stage position or probability', () => {
    const stage = PipelineSchema.parse(transformPipeline(makeRaw())).stages?.[0]
    expect(stage?.order).toBeUndefined()
    expect(stage?.win_probability).toBeUndefined()
  })

  it('throws instead of inventing an id when pipeline_id is missing', () => {
    const raw = makeRaw() as Record<string, unknown>
    delete raw['pipeline_id']
    raw['id'] = 'legacy'
    expect(() => transformPipeline(raw as RawNimblePipeline)).toThrow(/pipeline_id/)
  })

  it('throws when a stage has no stage_id', () => {
    const raw = makeRaw({ stages: [{ name: 'X' } as never] })
    expect(() => transformPipeline(raw)).toThrow(/stage_id/)
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
