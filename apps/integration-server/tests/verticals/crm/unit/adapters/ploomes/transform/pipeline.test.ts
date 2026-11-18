import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import { transformPipeline } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/pipeline'
import type { RawPloomesPipeline } from '../../../../../../../src/verticals/crm/adapters/ploomes/transform/pipeline'

/**
 * Built from the documented fields of GET /Deals@Pipelines (Id, Name,
 * Ordination, ...) with `$expand=Stages`, each stage carrying the documented
 * /Deals@Stages fields Id, Name, PipelineId and Ordination
 * (https://developers.ploomes.com/json/openapi.json).
 */
function makeRaw(overrides: Partial<RawPloomesPipeline> = {}): RawPloomesPipeline {
  return {
    Id: 40001,
    Name: 'Funil de Vendas',
    MustPassAllStages: false,
    ForbiddenStageReturn: false,
    Archived: false,
    Ordination: 0,
    Stages: [
      { Id: 7, Name: 'Negociação', PipelineId: 40001, Ordination: 30 },
      { Id: 5, Name: 'Prospecção', PipelineId: 40001, Ordination: 10 },
      { Id: 6, Name: 'Proposta', PipelineId: 40001, Ordination: 20 },
    ],
    ...overrides,
  }
}

describe('ploomes transformPipeline', () => {
  it('parses against the canonical schema', () => {
    expect(() => PipelineSchema.parse(transformPipeline(makeRaw()))).not.toThrow()
  })
  it('maps Id and Name', () => {
    const p = transformPipeline(makeRaw())
    expect(p.id).toBe('40001')
    expect(p.name).toBe('Funil de Vendas')
  })
  it('maps Stages sorted by Ordination, numbered from 0', () => {
    expect(transformPipeline(makeRaw()).stages).toEqual([
      { id: '5', name: 'Prospecção', order: 0 },
      { id: '6', name: 'Proposta', order: 1 },
      { id: '7', name: 'Negociação', order: 2 },
    ])
  })
  it('does not read the old Steps key', () => {
    const raw = makeRaw({ Stages: undefined, Steps: [{ Id: 1, Name: 'x', Order: 1 }] })
    expect(transformPipeline(raw).stages).toEqual([])
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPipeline(raw).metadata).toBe(raw)
  })
})
