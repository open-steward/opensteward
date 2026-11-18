import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipelineFromStages } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/pipeline'
import type { RawRdStationStage } from '../../../../../../../src/verticals/crm/adapters/rd-station-crm/transform/pipeline'

describe('rd-station-crm transformPipelineFromStages', () => {
  it('returns default pipeline id', () => {
    expect(transformPipelineFromStages([]).id).toBe('default')
  })
  it('maps stages from stage array', () => {
    const stages: RawRdStationStage[] = [{ _id: 's1', name: 'Lead' }]
    const result = transformPipelineFromStages(stages)
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('s1')
    expect(result.stages?.[0].name).toBe('Lead')
  })
  it('handles empty stages', () => {
    const result = transformPipelineFromStages([])
    expect(result.stages).toHaveLength(0)
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformPipelineFromStages([])).not.toThrow()
  })
  it('sets metadata to deal_stages object', () => {
    const stages: RawRdStationStage[] = [{ _id: 's1' }]
    const result = transformPipelineFromStages(stages)
    expect(result.metadata).toEqual({ deal_stages: stages })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipelineFromStages([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
