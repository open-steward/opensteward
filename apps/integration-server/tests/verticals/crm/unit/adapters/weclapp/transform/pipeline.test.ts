import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipelineFromStages, type RawWeclappSalesStage } from '../../../../../../../src/verticals/crm/adapters/weclapp/transform/pipeline'

describe('weclapp transformPipelineFromStages', () => {
  it('returns weclapp-pipeline id', () => {
    expect(transformPipelineFromStages([]).id).toBe('weclapp-pipeline')
  })

  it('maps stages', () => {
    const stages: RawWeclappSalesStage[] = [{ id: '1', name: 'Prospect' }]
    const result = transformPipelineFromStages(stages)
    expect(result.stages).toHaveLength(1)
    expect(result.stages?.[0].id).toBe('1')
    expect(result.stages?.[0].name).toBe('Prospect')
  })

  it('handles empty stages array', () => {
    expect(() => transformPipelineFromStages([])).not.toThrow()
  })

  it('preserves stages in metadata', () => {
    const stages: RawWeclappSalesStage[] = [{ id: '1' }]
    const result = transformPipelineFromStages(stages)
    expect((result.metadata as Record<string, unknown>).stages).toBe(stages)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPipelineFromStages([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })
})
