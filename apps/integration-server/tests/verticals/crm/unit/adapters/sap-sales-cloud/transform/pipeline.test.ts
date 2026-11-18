import { describe, it, expect } from 'vitest'
import {
  transformSalesPhaseToStage,
  transformPipelineFromPhases,
  type RawSapSalesPhase,
} from '../../../../../../../src/verticals/crm/adapters/sap-sales-cloud/transform/pipeline'
import {
  PipelineSchema,
  PipelineStageSchema,
} from '../../../../../../../src/verticals/crm/schema/pipeline'

describe('sap-sales-cloud transformSalesPhaseToStage', () => {
  it('maps code to stage id', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-01', name: 'Prospect' }).id).toBe('PH-01')
  })

  it('maps name', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-01', name: 'Prospect' }).name).toBe('Prospect')
  })

  it('falls back to code when name absent', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-02' }).name).toBe('PH-02')
  })

  it('maps sequenceNumber to order', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-01', sequenceNumber: 2 }).order).toBe(2)
  })

  it('maps string sequenceNumber to number', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-01', sequenceNumber: '3' }).order).toBe(3)
  })

  it('maps winProbability', () => {
    expect(transformSalesPhaseToStage({ code: 'PH-01', winProbability: 75 }).win_probability).toBe(
      75,
    )
  })

  it('produces schema-valid PipelineStage', () => {
    const raw: RawSapSalesPhase = {
      code: 'PH-03',
      name: 'Proposal',
      sequenceNumber: 3,
      winProbability: 60,
    }
    expect(() => PipelineStageSchema.parse(transformSalesPhaseToStage(raw))).not.toThrow()
  })
})

describe('sap-sales-cloud transformPipelineFromPhases', () => {
  it('synthesises a single pipeline with id "default"', () => {
    expect(transformPipelineFromPhases([]).id).toBe('default')
  })

  it('sets name to "Sales Pipeline"', () => {
    expect(transformPipelineFromPhases([]).name).toBe('Sales Pipeline')
  })

  it('sorts stages by sequenceNumber ascending', () => {
    const phases: RawSapSalesPhase[] = [
      { code: 'PH-03', name: 'Negotiation', sequenceNumber: 3 },
      { code: 'PH-01', name: 'Prospect', sequenceNumber: 1 },
      { code: 'PH-02', name: 'Qualify', sequenceNumber: 2 },
    ]
    const pipeline = transformPipelineFromPhases(phases)
    expect(pipeline.stages?.map((s) => s.id)).toEqual(['PH-01', 'PH-02', 'PH-03'])
  })

  it('sets is_active to true', () => {
    expect(transformPipelineFromPhases([]).is_active).toBe(true)
  })

  it('produces schema-valid Pipeline output', () => {
    const phases: RawSapSalesPhase[] = [
      { code: 'PH-01', name: 'Prospect', sequenceNumber: 1, winProbability: 10 },
      { code: 'PH-02', name: 'Proposal', sequenceNumber: 2, winProbability: 50 },
    ]
    expect(() => PipelineSchema.parse(transformPipelineFromPhases(phases))).not.toThrow()
  })
})
