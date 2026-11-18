/**
 * Fixture fields are Pipeline.v2.yaml's and Stage.v2.yaml's:
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Pipeline.v2.yaml
 * https://stoplight.io/api/v1/projects/moskit/api-v2/nodes/models/Stage.v2.yaml
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawMoskitPipeline,
  type RawMoskitStage,
} from '../../../../../../../src/verticals/crm/adapters/moskit/transform/pipeline'

const PIPELINE: RawMoskitPipeline = {
  id: 1,
  name: 'Vendas',
  dateCreated: '2020-07-08T18:18:50.000+00:00',
  priority: 0,
}
const STAGES: RawMoskitStage[] = [
  { id: 10, name: 'Prospecção', priority: 0, description: '', pipeline: { id: 1 } },
  { id: 11, name: 'Proposta', priority: 1, pipeline: { id: 1 } },
]

describe('moskit transformPipeline', () => {
  it('maps the documented fields and the given stages, and satisfies the schema', () => {
    const out = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(out).toMatchObject({
      id: '1',
      name: 'Vendas',
      created_at: '2020-07-08T18:18:50.000Z',
      stages: [
        { id: '10', name: 'Prospecção' },
        { id: '11', name: 'Proposta' },
      ],
    })
  })

  it('does not read an undocumented order from priority', () => {
    const out = PipelineSchema.parse(transformPipeline(PIPELINE, STAGES))
    expect(out.stages?.every((s) => s.order === undefined)).toBe(true)
  })

  it('parses a pipeline with no stages', () => {
    expect(PipelineSchema.parse(transformPipeline({ id: 2 }, [])).stages).toEqual([])
  })

  it('keeps the raw pipeline and its stages in metadata', () => {
    const out = transformPipeline(PIPELINE, STAGES)
    expect(out.metadata).toMatchObject({ id: 1, name: 'Vendas', stages: STAGES })
  })
})
