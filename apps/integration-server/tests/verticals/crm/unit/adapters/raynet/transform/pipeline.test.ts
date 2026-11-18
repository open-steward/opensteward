import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  transformPipelines,
} from '../../../../../../../src/verticals/crm/adapters/raynet/transform/pipeline'
import { DEAL_PHASE, DEAL_TYPE } from '../fixtures'

describe('raynet transformPipeline (GET /businessCaseType/ + GET /businessCasePhase/)', () => {
  const phaseOfType3 = { ...DEAL_PHASE, businessCaseTypeId: 3 }

  it('maps a deal type and its phases and parses as a canonical Pipeline', () => {
    const p = PipelineSchema.parse(transformPipeline(DEAL_TYPE, [phaseOfType3]))
    expect(p).toMatchObject({
      id: '3',
      name: 'Service',
      stages: [{ id: '3', name: 'Before closing', order: 0, win_probability: 50 }],
    })
    expect(p.metadata).toEqual(DEAL_TYPE)
  })

  it('takes only the phases whose businessCaseTypeId is the type id (the example phase names type 64)', () => {
    const p = PipelineSchema.parse(transformPipeline(DEAL_TYPE, [DEAL_PHASE]))
    expect(p.stages).toEqual([])
  })

  it('refuses a deal type or stage without its required name instead of inventing one', () => {
    expect(() => transformPipeline({ ...DEAL_TYPE, code01: null }, [])).toThrow(
      expect.objectContaining({ statusCode: 502 }),
    )
    expect(() => transformPipeline(DEAL_TYPE, [{ ...phaseOfType3, code01: null }])).toThrow(
      expect.objectContaining({ statusCode: 502 }),
    )
  })

  it('orders stages and pipelines by sequenceNumber', () => {
    const phases = [
      { ...phaseOfType3, id: 10, code01: 'Won', sequenceNumber: 3 },
      { ...phaseOfType3, id: 11, code01: 'Offer', sequenceNumber: 2 },
      { ...phaseOfType3, id: 12, code01: 'Lead', sequenceNumber: 1 },
    ]
    const types = [{ ...DEAL_TYPE, id: 9, sequenceNumber: 2 }, DEAL_TYPE]
    const out = transformPipelines(types, phases).map((p) => PipelineSchema.parse(p))
    expect(out.map((p) => p.id)).toEqual(['3', '9'])
    expect(out[0]!.stages!.map((s) => [s.name, s.order])).toEqual([
      ['Lead', 0],
      ['Offer', 1],
      ['Won', 2],
    ])
    expect(out[1]!.stages).toEqual([])
  })
})
