/**
 * Pipeliner (Coevera) Pipeline → canonical Pipeline.
 *
 * Fixture shape from the vendor's first-party OpenAPI
 * (http://pipeliner-api-doc.s3-website-eu-west-1.amazonaws.com/latest/rest/space/openapi.json),
 * `components.schemas.Pipeline` with `steps` of `batchStepInput`:
 *   steps: "Steps associated with this Pipeline."
 *   sort_order: "Position of the step within its pipeline or process; lower values appear first."
 *   percent: "Probability percent associated with the step (0-100). Required for opportunity
 *             pipeline steps; null for lead/quote process steps."
 * Dates (https://developers.pipelinersales.com/api-docs/core-api-concepts/dates):
 *   "All dates are stored in the UTC timezone."
 */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawPipelinerPipeline,
  type RawPipelinerStep,
} from '../../../../../../../src/verticals/crm/adapters/pipeliner/transform/pipeline'

function makeStep(overrides: Partial<RawPipelinerStep> = {}): RawPipelinerStep {
  return {
    id: '01234567-abcd-dcba-ffff-00000000000a',
    name: 'Prospecting',
    description: 'string',
    percent: 10,
    sort_order: 1,
    timeframe: 1,
    revision: 1,
    ...overrides,
  }
}

/** The documented example Pipeline (schema examples), with steps expanded. */
function makePipeline(overrides: Partial<RawPipelinerPipeline> = {}): RawPipelinerPipeline {
  return {
    is_delete_protected: false,
    id: '01234567-abcd-dcba-ffff-000000000000',
    is_deleted: false,
    modified: '2019-01-01T00:00:00',
    created: '2019-01-01T00:00:00',
    color: 1,
    name: 'string',
    revision: 1,
    steps: [makeStep()],
    opportunity_types: [],
    ...overrides,
  }
}

describe('pipeliner transformPipeline', () => {
  it('maps the documented example to a schema-valid canonical pipeline', () => {
    const raw = makePipeline()
    const out = PipelineSchema.parse(transformPipeline(raw))
    expect(out.id).toBe('01234567-abcd-dcba-ffff-000000000000')
    expect(out.name).toBe('string')
    expect(out.created_at).toBe('2019-01-01T00:00:00.000Z')
    expect(out.updated_at).toBe('2019-01-01T00:00:00.000Z')
    expect(out.stages).toEqual([
      {
        id: '01234567-abcd-dcba-ffff-00000000000a',
        name: 'Prospecting',
        order: 0,
        win_probability: 10,
      },
    ])
    expect(out.metadata).toEqual(raw)
  })

  it('orders stages by sort_order and gives each its 0-based position', () => {
    const raw = makePipeline({
      steps: [
        makeStep({ id: 's-c', name: 'Won', sort_order: 30, percent: 100 }),
        makeStep({ id: 's-a', name: 'Lead', sort_order: 5, percent: 10 }),
        makeStep({ id: 's-b', name: 'Proposal', sort_order: 20, percent: 60 }),
      ],
    })
    const out = PipelineSchema.parse(transformPipeline(raw))
    expect(out.stages?.map((s) => [s.id, s.order, s.win_probability])).toEqual([
      ['s-a', 0, 10],
      ['s-b', 1, 60],
      ['s-c', 2, 100],
    ])
  })

  it('a null percent is omitted, never defaulted', () => {
    const out = PipelineSchema.parse(
      transformPipeline(makePipeline({ steps: [makeStep({ percent: null })] })),
    )
    expect(out.stages?.[0]).not.toHaveProperty('win_probability')
  })

  it('a date with an explicit offset keeps its instant', () => {
    const out = PipelineSchema.parse(
      transformPipeline(makePipeline({ modified: '2019-02-01 07:41:49.529970+00:00' })),
    )
    expect(out.updated_at).toBe('2019-02-01T07:41:49.529Z')
  })

  it('an empty steps array gives no stages', () => {
    expect(PipelineSchema.parse(transformPipeline(makePipeline({ steps: [] }))).stages).toEqual([])
  })

  it('an unexpanded step (a URI string) is refused, not dropped', () => {
    const raw = makePipeline({
      steps: ['https://eu-central.api.pipelinersales.com/api/v100/rest/spaces/s/entities/Steps/x'],
    })
    expect(() => transformPipeline(raw)).toThrow(/expand=steps/)
  })

  it('a step without an id is refused rather than given an invented one', () => {
    const raw = makePipeline({ steps: [{ name: 'No id', sort_order: 1 } as RawPipelinerStep] })
    expect(() => transformPipeline(raw)).toThrow(/id/)
  })

  it('a step with an empty-string id is refused like a missing one', () => {
    const raw = makePipeline({ steps: [makeStep({ id: '' })] })
    expect(() => transformPipeline(raw)).toThrow(/without an id/)
  })

  it('steps without a sort_order follow the ordered ones, in response order', () => {
    const raw = makePipeline({
      steps: [
        makeStep({ id: 'u-1', name: 'Unordered 1', sort_order: null }),
        makeStep({ id: 'o-2', name: 'Ordered 2', sort_order: 2 }),
        makeStep({ id: 'u-2', name: 'Unordered 2', sort_order: undefined }),
        makeStep({ id: 'o-1', name: 'Ordered 1', sort_order: 1 }),
      ],
    })
    const out = PipelineSchema.parse(transformPipeline(raw))
    expect(out.stages?.map((s) => [s.id, s.order])).toEqual([
      ['o-1', 0],
      ['o-2', 1],
      ['u-1', 2],
      ['u-2', 3],
    ])
  })

  it('steps sharing a sort_order keep their response order', () => {
    const raw = makePipeline({
      steps: [
        makeStep({ id: 't-1', name: 'Tie 1', sort_order: 5 }),
        makeStep({ id: 't-2', name: 'Tie 2', sort_order: 5 }),
        makeStep({ id: 't-3', name: 'Tie 3', sort_order: 5 }),
      ],
    })
    const out = PipelineSchema.parse(transformPipeline(raw))
    expect(out.stages?.map((s) => s.id)).toEqual(['t-1', 't-2', 't-3'])
  })

  it('a step without a name is refused rather than given an empty one', () => {
    const raw = makePipeline({ steps: [{ id: 's-1', sort_order: 1 }] })
    expect(() => transformPipeline(raw)).toThrow(/no name/)
  })
})
