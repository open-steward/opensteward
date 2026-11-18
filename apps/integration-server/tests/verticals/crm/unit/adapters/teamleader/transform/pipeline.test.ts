import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawTeamleaderDealPipeline,
  type RawTeamleaderDealPhase,
} from '../../../../../../../src/verticals/crm/adapters/teamleader/transform/pipeline'

// Documented dealPipelines.list example row
// (https://developer.focus.teamleader.eu/docs/api/deal-pipelines-list).
const PIPELINE: RawTeamleaderDealPipeline = {
  id: 'f350e48a-fbc3-0a79-e62a-53aa1ae86d44',
  name: 'Main Pipeline',
}

// Documented dealPhases.list example row
// (https://developer.focus.teamleader.eu/docs/api/deal-phases-list).
const PHASE: RawTeamleaderDealPhase = {
  id: '21efc56e-1ba8-469d-926a-e89502591b47',
  name: 'New',
  actions: ['create_event'],
  requires_attention_after: { amount: 7, unit: 'days' },
  probability: 0.75,
}

describe('teamleader transformPipeline', () => {
  it('maps the documented pipeline and phase rows onto the canonical schema', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, [PHASE]))
    expect(result.id).toBe('f350e48a-fbc3-0a79-e62a-53aa1ae86d44')
    expect(result.name).toBe('Main Pipeline')
    expect(result.stages).toEqual([
      { id: '21efc56e-1ba8-469d-926a-e89502591b47', name: 'New', order: 0, win_probability: 75 },
    ])
    expect(result.metadata).toEqual({ pipeline: PIPELINE, phases: [PHASE] })
  })

  it('orders stages by their position in the list', () => {
    const second: RawTeamleaderDealPhase = { id: 'ph2', name: 'Won' }
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, [PHASE, second]))
    expect(result.stages?.map((s) => [s.id, s.order])).toEqual([
      [PHASE.id, 0],
      ['ph2', 1],
    ])
  })

  it('omits win_probability when the phase has no probability', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, [{ id: 'ph', name: 'X' }]))
    expect(result.stages?.[0]).not.toHaveProperty('win_probability')
  })

  it('does not invent an activity flag', () => {
    const result = PipelineSchema.parse(transformPipeline(PIPELINE, []))
    expect(result.is_active).toBeUndefined()
    expect(result.stages).toEqual([])
  })
})
