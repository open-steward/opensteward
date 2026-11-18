import { describe, it, expect } from 'vitest'
import {
  transformPipeline,
  type RawVendastaPipeline,
} from '../../../../../../../src/verticals/crm/adapters/vendasta/transform/pipeline'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'

function makeRaw(overrides: Partial<RawVendastaPipeline> = {}): RawVendastaPipeline {
  return {
    pipelineId: 'pipe_001',
    name: 'Sales Pipeline',
    stages: [
      { stageId: 'stage_prospect', name: 'Prospect' },
      { stageId: 'stage_negotiation', name: 'Negotiation' },
      { stageId: 'stage_closed', name: 'Closed' },
    ],
    ...overrides,
  }
}

describe('vendasta transformPipeline', () => {
  it('maps id from pipelineId', () => {
    expect(transformPipeline(makeRaw()).id).toBe('pipe_001')
  })

  it('maps name', () => {
    expect(transformPipeline(makeRaw()).name).toBe('Sales Pipeline')
  })

  it('maps stages with stageId as id', () => {
    const stages = transformPipeline(makeRaw()).stages
    expect(stages?.[0].id).toBe('stage_prospect')
    expect(stages?.[0].name).toBe('Prospect')
  })

  it('assigns stage order by array index', () => {
    const stages = transformPipeline(makeRaw()).stages
    expect(stages?.[0].order).toBe(0)
    expect(stages?.[1].order).toBe(1)
    expect(stages?.[2].order).toBe(2)
  })

  it('falls back to string index when stageId absent', () => {
    const raw = makeRaw({ stages: [{ name: 'Prospect' }] })
    expect(transformPipeline(raw).stages?.[0].id).toBe('0')
  })

  it('preserves raw as metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })

  it('handles empty stages array', () => {
    const raw = makeRaw({ stages: [] })
    const result = transformPipeline(raw)
    expect(result.stages).toEqual([])
    expect(() => PipelineSchema.parse(result)).not.toThrow()
  })

  it('handles missing pipelineId with empty string id', () => {
    const raw = makeRaw({ pipelineId: undefined })
    expect(transformPipeline(raw).id).toBe('')
  })
})
